// A link the API made for this site (an order's tracking page, a payment), as the path to open
// here: its address with the query, which carries the link's signed token where it has one
// (SEC-8, D-080), and without the host, which is the API's idea of the site and may not be the
// one the customer is on.
export function sitePath(link: string): string {
  const url = new URL(link);
  return url.pathname + url.search;
}
