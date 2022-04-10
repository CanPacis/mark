import "./index.css";
import React, { useEffect } from "react";
import ReactDOM from "react-dom";
import { MantineProvider, ColorSchemeProvider, TypographyStylesProvider } from "@mantine/core";
import { ModalsProvider } from "@mantine/modals";
import { NotificationsProvider } from "@mantine/notifications";
import { useLocalStorage, useToggle } from "@mantine/hooks";
import { RecoilRoot } from "recoil";
import App from "./App";

type ColorScheme = "dark" | "light";

function Wrapper() {
  const [value, setValue] = useLocalStorage<ColorScheme>({
    key: "color-scheme",
    defaultValue: "dark",
  });
  const [scheme, toggle] = useToggle<ColorScheme>(value, ["dark", "light"]);

  useEffect(() => {
    setValue(scheme);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scheme]);

  useEffect(() => {
    if (scheme !== value) {
      toggle();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const toggleColorScheme = () => {
    toggle();
  };

  return (
    <RecoilRoot>
      <MantineProvider
        theme={{
          colorScheme: scheme,
        }}
      >
        <NotificationsProvider>
          <ModalsProvider>
            <ColorSchemeProvider toggleColorScheme={toggleColorScheme} colorScheme={scheme}>
              <TypographyStylesProvider>
                <App />
              </TypographyStylesProvider>
            </ColorSchemeProvider>
          </ModalsProvider>
        </NotificationsProvider>
      </MantineProvider>
    </RecoilRoot>
  );
}

ReactDOM.render(
  <React.StrictMode>
    <Wrapper />
  </React.StrictMode>,
  document.getElementById("root")
);
