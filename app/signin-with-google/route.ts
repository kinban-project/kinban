export async function GET(request: Request) {
  const url = new URL(request.url);
  const target = new URL("/auth/google/start", url.origin);
  const returnTo = url.searchParams.get("return_to");
  if (returnTo) target.searchParams.set("return_to", returnTo);
  return Response.redirect(target, 302);
}
