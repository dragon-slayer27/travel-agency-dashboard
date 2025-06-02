import { ButtonComponent } from "@syncfusion/ej2-react-buttons";
import { Link, useNavigate } from "react-router";
import { logoutUser, swapUserRole, getUser } from "~/appwrite/auth";
import { useEffect, useState } from "react";

const PageLayout = () => {
  const navigate = useNavigate();
  const [userRole, setUserRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchUser = async () => {
      try {
        const user = await getUser();
        setUserRole(user?.status || null);
      } catch (e) {
        setUserRole(null);
      } finally {
        setLoading(false);
      }
    };
    fetchUser();
  }, []);

  useEffect(() => {
    if (!loading && userRole === null) {
      navigate("/sign-in");
    }
  }, [loading, userRole, navigate]);

  const handleLogout = async () => {
    await logoutUser();
    navigate("/sign-in");
  };

  const handleSwapRoles = async () => {
    try {
      const newStatus = await swapUserRole();
      setUserRole(newStatus);
      alert(`Role switched to ${newStatus}`);
    } catch (e) {
      alert("Error Swapping Roles...");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        Loading...
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-6">
      <button
        onClick={handleLogout}
        className="cursor-pointer flex items-center gap-2"
      >
        <img src="/assets/icons/logout.svg" alt="logout" className="size-6" />
        <span className="p-20-semibold text-red-600">Logout</span>
      </button>

      <ButtonComponent
        type="button"
        className="button-class !h-12 !w-50 mx-auto"
        onClick={handleSwapRoles}
      >
        <span className="p-16-semibold text-white">Swap Roles</span>
      </ButtonComponent>

      {userRole === "admin" && (
        <Link to="/dashboard" className="w-full flex justify-center">
          <ButtonComponent
            type="button"
            className="button-class !h-12 !w-50 mx-auto"
          >
            <span className="p-16-semibold text-white">Dashboard</span>
          </ButtonComponent>
        </Link>
      )}
    </div>
  );
};

export default PageLayout;
