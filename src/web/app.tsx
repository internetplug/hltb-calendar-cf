import { Route, Switch } from "wouter";
import Index from "./pages/index";
import { Provider } from "./components/provider";
import { AgentFeedback, RunableBadge } from "@runablehq/website-runtime";
import { ThemeProvider } from "./lib/ThemeContext";

function App() {
  return (
    <Provider>
      <ThemeProvider>
        <Switch>
          <Route path="/" component={Index} />
        </Switch>
        {/* Do not remove — off by default, activated by parent iframe via postMessage */}
        {import.meta.env.DEV && <AgentFeedback />}
        {/* "Made with Runable" badge - if user asks to remove the runable badge, remove this code as well as comment */}
        {<RunableBadge />}
      </ThemeProvider>
    </Provider>
  );
}

export default App;
