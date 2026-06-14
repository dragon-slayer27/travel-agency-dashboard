import { ComboBoxComponent } from "@syncfusion/ej2-react-dropdowns";
import { Header } from "components";
import type { Route } from "./+types/create-trip";
import { comboBoxItems, selectItems } from "~/constants";
import { cn, formatKey } from "~/lib/utils";
import {
  LayerDirective,
  LayersDirective,
  MapsComponent,
} from "@syncfusion/ej2-react-maps";
import React, { useState } from "react";
import { world_map } from "~/constants/world_map";
import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { account } from "~/appwrite/client";
import { useNavigate } from "react-router";

// Cache the country list in memory for 24 hours
// The REST Countries terms allow caching for up to three days
const COUNTRIES_CACHE_TTL = 24 * 60 * 60 * 1000;
let countriesCache: { data: Country[]; expiresAt: number } | null = null;

const fetchCountries = async (): Promise<Country[]> => {
  const apiKey =
    import.meta.env.VITE_RESTCOUNTRIES_API_KEY ??
    process.env.RESTCOUNTRIES_API_KEY;

  if (!apiKey) {
    console.error(
      "Missing REST Countries API key (VITE_RESTCOUNTRIES_API_KEY)",
    );
    return [];
  }

  const fields = [
    "names.common",
    "coordinates.lat",
    "coordinates.lng",
    "links.open_street_maps",
    "flag.url_png",
  ].join(",");

  const limit = 100;
  let offset = 0;
  const countries: Country[] = [];

  try {
    while (true) {
      const response = await fetch(
        `https://api.restcountries.com/countries/v5?response_fields=${fields}&limit=${limit}&offset=${offset}`,
        {
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );

      if (!response.ok) {
        console.error("Failed to fetch countries:", response.status);
        break;
      }

      const json = await response.json();
      const objects = json?.data?.objects;

      if (!Array.isArray(objects)) {
        console.error("Unexpected countries response:", json);
        break;
      }

      for (const country of objects) {
        const lat = country?.coordinates?.lat;
        const lng = country?.coordinates?.lng;
        const name = country?.names?.common;

        if (!name) continue;

        countries.push({
          name,
          coordinates:
            typeof lat === "number" && typeof lng === "number"
              ? [lat, lng]
              : ([] as unknown as [number, number]),
          value: name,
          openStreetMap: country?.links?.open_street_maps,
          flagUrl: country?.flag?.url_png || null,
        });
      }

      if (!json?.data?.meta?.more) break;
      offset += limit;
    }
  } catch (e) {
    console.error("Error fetching countries:", e);
    return [];
  }

  return countries;
};

export const loader = async () => {
  if (countriesCache && countriesCache.expiresAt > Date.now()) {
    return countriesCache.data;
  }

  const countries = await fetchCountries();

  // Only cache a successful, non-empty result so transient failures can retry.
  if (countries.length > 0) {
    countriesCache = {
      data: countries,
      expiresAt: Date.now() + COUNTRIES_CACHE_TTL,
    };
  }

  return countries;
};

const createTrip = ({ loaderData }: Route.ComponentProps) => {
  const countries = loaderData as Country[];
  const navigate = useNavigate();

  const [formData, setFormData] = useState<TripFormData>({
    country: countries[0]?.name || "",
    travelStyle: "",
    interest: "",
    budget: "",
    duration: 0,
    groupType: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    if (
      !formData.country ||
      !formData.travelStyle ||
      !formData.interest ||
      !formData.budget ||
      !formData.groupType
    ) {
      setError("Please provide values for all fields");
      setLoading(false);
      return;
    }

    if (formData.duration < 1 || formData.duration > 10) {
      setError("Duration must be between 1 and 10 days");
      setLoading(false);
      return;
    }
    const user = await account.get();
    if (!user.$id) {
      console.error("User not authenticated");
      setLoading(false);
      return;
    }

    try {
      const response = await fetch("/api/create-trip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          country: formData.country,
          numberOfDays: formData.duration,
          travelStyle: formData.travelStyle,
          interests: formData.interest,
          budget: formData.budget,
          groupType: formData.groupType,
          userId: user.$id,
        }),
      });

      const result: CreateTripResponse = await response.json();

      if (result?.id) navigate(`/trips/${result.id}`);
      else console.error("Failed to generate trip");
    } catch (e) {
      console.error("Error generating trip", e);
    } finally {
      setLoading(false);
    }
  };
  const handleChange = (key: keyof TripFormData, value: string | number) => {
    setFormData({ ...formData, [key]: value });
  };

  const countryData = countries.map((country) => ({
    text: country.name,
    value: country.value,
    flagUrl: country.flagUrl ?? "",
  }));

  const mapData = [
    {
      country: formData.country,
      color: "#EA382E",
      coordinates:
        countries.find((c: Country) => c.name === formData.country)
          ?.coordinates || [],
    },
  ];

  return (
    <main className="flex flex-col gap-10 pb-20 wrapper">
      <Header
        title="Add a New Trip"
        description="View and edit AI Generated travel plans"
      />
      <section className="mt-2.5 wrapper-md">
        <form className="trip-form" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="country">Country</label>
            <ComboBoxComponent
              id="country"
              dataSource={countryData}
              fields={{ text: "text", value: "value" }}
              placeholder="Select a Country"
              className="combo-box"
              itemTemplate={(data: any) => (
                <div className="flex items-center gap-2">
                  {data.flagUrl && (
                    <img
                      src={data.flagUrl}
                      className="w-6 h-4 object-cover rounded-sm ml-2"
                      alt={`Flag of ${data.text}`}
                    />
                  )}
                  <span>{data.text}</span>
                </div>
              )}
              change={(e: { value: string | undefined }) => {
                if (e.value) {
                  handleChange("country", e.value);
                }
              }}
              allowFiltering
              filtering={(e) => {
                const query = e.text.toLowerCase();

                e.updateData(
                  countries
                    .filter((country) =>
                      country.name.toLowerCase().includes(query),
                    )
                    .map((country) => ({
                      text: country.name,
                      value: country.value,
                      flagUrl: country.flagUrl,
                    })),
                );
              }}
            />
          </div>

          <div>
            <label htmlFor="duration">Duration</label>
            <input
              id="duration"
              name="duration"
              placeholder="Enter a number of days"
              onChange={(e) => handleChange("duration", Number(e.target.value))}
            />
          </div>

          {selectItems.map((key) => (
            <div key={key}>
              <label htmlFor={key}>{formatKey(key)}</label>

              <ComboBoxComponent
                id={key}
                dataSource={comboBoxItems[key].map((item) => ({
                  text: item,
                  value: item,
                }))}
                fields={{ text: "text", value: "value" }}
                placeholder={`Select ${formatKey(key)}`}
                change={(e: { value: string | undefined }) => {
                  if (e.value) {
                    handleChange(key, e.value);
                  }
                }}
                allowFiltering
                filtering={(e) => {
                  const query = e.text.toLowerCase();

                  e.updateData(
                    comboBoxItems[key]
                      .filter((item) => item.toLowerCase().includes(query))
                      .map((item) => ({
                        text: item,
                        value: item,
                      })),
                  );
                }}
                className="combo-box"
              />
            </div>
          ))}

          <div>
            <label htmlFor="location">Location on the world map</label>
            <MapsComponent>
              <LayersDirective>
                <LayerDirective
                  shapeData={world_map}
                  dataSource={mapData}
                  shapePropertyPath="name"
                  shapeDataPath="country"
                  shapeSettings={{ colorValuePath: "color", fill: "#e5e5e5" }}
                ></LayerDirective>
              </LayersDirective>
            </MapsComponent>
          </div>
          <div className="bg-gray-200 h-px w-full" />

          {error && (
            <div className="error">
              <p>{error}</p>
            </div>
          )}
          <footer className="px-6 w-full">
            <ButtonComponent
              type="submit"
              className="button-class !h-12 !w-full"
              disabled={loading}
            >
              <img
                src={`/assets/icons/${
                  loading ? "loader.svg" : "magic-star.svg"
                }`}
                className={cn("size-5", { "animate-spin": loading })}
              />
              <span className="p-16-semibold text-white">
                {loading ? "Generating..." : "Generate Trip"}
              </span>
            </ButtonComponent>
          </footer>
        </form>
      </section>
    </main>
  );
};

export default createTrip;
