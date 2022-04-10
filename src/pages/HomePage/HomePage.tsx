import { Welcome } from "@components/Welcome";
import { Text } from "@mantine/core";
import { style } from "./style";

export function HomePage() {
  const { classes } = style();
  return (
    <>
      <Welcome />
      <Text>Home Page</Text>
    </>
  );
}
