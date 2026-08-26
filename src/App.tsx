import { HouseholdProvider } from "./hooks/useHousehold";
import { ToastProvider } from "./hooks/useToast";
import { AuthView } from "./views/AuthView";
import { Shell } from "./views/Shell";
import { useHousehold } from "./hooks/useHousehold";
import { Spinner } from "./components/Spinner";

function Root() {
  const { session, loading } = useHousehold();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-950">
        <Spinner />
      </div>
    );
  }
  return session ? <Shell /> : <AuthView />;
}

export default function App() {
  return (
    <ToastProvider>
      <HouseholdProvider>
        <Root />
      </HouseholdProvider>
    </ToastProvider>
  );
}
