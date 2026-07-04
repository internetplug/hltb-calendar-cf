import { Route, Switch } from "wouter";
import Index from "./pages/index";
import { AgentFeedback } from "@runablehq/website-runtime";
import { ThemeProvider } from "./lib/ThemeContext";

function App() {
  return (
    <ThemeProvider>
      <Switch>
        <Route path="/" component={Index} />
      </Switch>
      {/* Do not remove — off by default, activated by parent iframe via postMessage */}
      {import.meta.env.DEV && <AgentFeedback />}
    </ThemeProvider>
  );
}

export default App;
