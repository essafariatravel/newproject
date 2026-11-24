import {NextResponse} from "next/server";
import {getSessionUser} from "@/lib/auth";
import {isAgencyRole} from "@/lib/types";
import {getApplicationDetail} from "@/lib/queries";
import {db} from "@/lib/db";
import {notifications} from "@/db/schema";
import {and,eq,isNull} from "drizzle-orm";
export const dynamic="force-dynamic";
const headers={"Cache-Control":"private, no-store"};
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}){
 if(request.headers.get("origin")!==new URL(request.url).origin)return NextResponse.json({error:"Forbidden"},{status:403,headers});
 const user=await getSessionUser();if(!user)return NextResponse.json({error:"Unauthorized"},{status:401,headers});
 if(!user.agencyId||!isAgencyRole(user.role)||user.mustChangePassword)return NextResponse.json({error:"Forbidden"},{status:403,headers});
 const {id}=await params;if(!await getApplicationDetail(id,user))return NextResponse.json({error:"Not found"},{status:404,headers});
 await db.update(notifications).set({readAt:new Date()}).where(and(eq(notifications.userId,user.id),eq(notifications.agencyId,user.agencyId),eq(notifications.applicationId,id),eq(notifications.type,"MESSAGE_POSTED"),isNull(notifications.readAt)));
 return NextResponse.json({ok:true},{headers})
}
