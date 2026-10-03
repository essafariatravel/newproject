import { GET as readinessGET } from "../route";

export const dynamic = "force-dynamic";

export async function GET() {
  return readinessGET();
}
