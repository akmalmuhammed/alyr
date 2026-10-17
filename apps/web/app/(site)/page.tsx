import { homeViewport } from "../_site/document";
import { HomePage } from "../_site/HomePage";

export const viewport = homeViewport;

export default function Page() {
  return <HomePage locale="en" />;
}