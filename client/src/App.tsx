import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/home";
import Build from "@/pages/build";
import Evaluate from "@/pages/evaluate";
import Launch from "@/pages/launch";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route path="/build" component={Build} />
      <Route path="/evaluate" component={Evaluate} />
      <Route path="/launch" component={Launch} />
      <Route path="/interview/:token" component={Launch} />
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Router />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
