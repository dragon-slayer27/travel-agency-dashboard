import { parseTripData } from "~/lib/utils";
import { database, appwriteConfig } from "./client";
import { Query } from "appwrite";

interface Document {
  [key: string]: any;
}

type FilterByDate = (
  items: Document[],
  key: string,
  start: string,
  end?: string,
) => number;

export const getUsersAndTripsStats = async (): Promise<DashboardStats> => {
  const d = new Date();
  const startCurrent = new Date(d.getFullYear(), d.getMonth(), 1).toISOString();
  const startPrev = new Date(
    d.getFullYear(),
    d.getMonth() - 1,
    1,
  ).toISOString();
  const endPrev = new Date(d.getFullYear(), d.getMonth(), 0).toISOString();

  const [users, trips] = await Promise.all([
    database.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.userCollectionId,
    ),
    database.listDocuments(
      appwriteConfig.databaseId,
      appwriteConfig.tripCollectionId,
    ),
  ]);

  const filterByDate: FilterByDate = (items, key, start, end) =>
    items.filter((item) => item[key] >= start && (!end || item[key] <= end))
      .length;

  const filterUsersByRole = (role: string) => {
    return users.documents.filter((u: Document) => u.status === role);
  };

  return {
    totalUsers: users.total,
    usersJoined: {
      currentMonth: filterByDate(
        users.documents,
        "joinedAt",
        startCurrent,
        undefined,
      ),
      lastMonth: filterByDate(users.documents, "joinedAt", startPrev, endPrev),
    },
    userRole: {
      total: filterUsersByRole("user").length,
      currentMonth: filterByDate(
        filterUsersByRole("user"),
        "joinedAt",
        startCurrent,
        undefined,
      ),
      lastMonth: filterByDate(
        filterUsersByRole("user"),
        "joinedAt",
        startPrev,
        endPrev,
      ),
    },
    totalTrips: trips.total,
    tripsCreated: {
      currentMonth: filterByDate(
        trips.documents,
        "createdAt",
        startCurrent,
        undefined,
      ),
      lastMonth: filterByDate(trips.documents, "createdAt", startPrev, endPrev),
    },
  };
};

export const getUserGrowthPerDay = async () => {
  const users = await database.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.userCollectionId,
  );

  const userGrowth = users.documents.reduce(
    (acc: { [key: string]: number }, user: Document) => {
      const date = new Date(user.joinedAt);
      const day = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    },
    {},
  );

  return Object.entries(userGrowth).map(([day, count]) => ({
    count: Number(count),
    day,
  }));
};

export const getTripsCreatedPerDay = async () => {
  const trips = await database.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.tripCollectionId,
  );

  const tripsGrowth = trips.documents.reduce(
    (acc: { [key: string]: number }, trip: Document) => {
      const date = new Date(trip.createdAt);
      const day = date.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      });
      acc[day] = (acc[day] || 0) + 1;
      return acc;
    },
    {},
  );

  return Object.entries(tripsGrowth).map(([day, count]) => ({
    count: Number(count),
    day,
  }));
};

export const getTripsByTravelStyle = async () => {
  const trips = await database.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.tripCollectionId,
  );

  const travelStyleCounts = trips.documents.reduce(
    (acc: { [key: string]: number }, trip: Document) => {
      const tripDetail = parseTripData(trip.tripDetail);

      if (tripDetail && tripDetail.travelStyle) {
        const travelStyle = tripDetail.travelStyle;
        acc[travelStyle] = (acc[travelStyle] || 0) + 1;
      }
      return acc;
    },
    {},
  );

  return Object.entries(travelStyleCounts).map(([travelStyle, count]) => ({
    count: Number(count),
    travelStyle,
  }));
};

export const getUsersWithRecentTrips = async (limit: number = 4) => {
  // Fetch trips ordered by most recent first so we can find who generated
  // trips recently and count how many each user has created.
  const trips = await database.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.tripCollectionId,
    [Query.orderDesc("createdAt"), Query.limit(1000)],
  );

  const statsByUser = new Map<
    string,
    { count: number; lastCreatedAt: string }
  >();

  for (const trip of trips.documents) {
    const userId = (trip as Document).userId;
    if (!userId) continue;

    const existing = statsByUser.get(userId);
    if (existing) {
      existing.count += 1;
    } else {
      // Documents are already sorted desc, so the first occurrence is the
      // user's most recent trip.
      statsByUser.set(userId, {
        count: 1,
        lastCreatedAt: (trip as Document).createdAt,
      });
    }
  }

  const userIds = Array.from(statsByUser.keys());
  if (userIds.length === 0) return [];

  // Look up the user profiles for everyone who has created a trip.
  const users = await database.listDocuments(
    appwriteConfig.databaseId,
    appwriteConfig.userCollectionId,
    [Query.equal("accountId", userIds), Query.limit(userIds.length)],
  );

  const userById = new Map(
    users.documents.map((u: Document) => [u.accountId, u]),
  );

  return userIds
    .map((userId) => {
      const stats = statsByUser.get(userId)!;
      const user = userById.get(userId);
      return {
        imageUrl: user?.imageUrl ?? "",
        name: user?.name ?? "Unknown user",
        count: stats.count,
        lastCreatedAt: stats.lastCreatedAt,
      };
    })
    .sort((a, b) => b.lastCreatedAt.localeCompare(a.lastCreatedAt))
    .slice(0, limit);
};
