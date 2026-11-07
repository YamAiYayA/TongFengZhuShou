import { requireIdentity } from "../../cursor/identity";

export async function requireViewer(request: Request) {
  const identity = await requireIdentity(request);
  if (identity instanceof Response) return identity;
  return identity;
}
