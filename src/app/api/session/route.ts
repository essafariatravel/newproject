import { getSessionUser } from "@/lib/auth";
export const dynamic="force-dynamic";
export async function GET() {
  const user=await getSessionUser();
  return Response.json({authenticated:Boolean(user)},{status:user?200:401,headers:{"Cache-Control":"no-store"}});
}
