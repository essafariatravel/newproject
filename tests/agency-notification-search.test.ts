import {describe,it,expect} from "vitest";
import {parseNotificationSearch,escapeNotificationLike,notificationCountryCodes} from "../src/lib/notification-search";
describe("agency notification search",()=>{
 it("combines unread and destination",()=>expect(parseNotificationSearch("non lues Chine")).toMatchObject({unread:true,terms:["chine"]}));
 it("supports Algiers relative day",()=>expect(parseNotificationSearch("hier").date).toBe("yesterday"));
 it("supports real amounts",()=>expect(parseNotificationSearch("50 000").amount).toBe("50000"));
 it("requires actual approval for approved visas",()=>expect(parseNotificationSearch("visa approuvé").approved).toBe(true));
 it("supports Arabic",()=>expect(parseNotificationSearch("غير مقروءة أمس").unread).toBe(true));
 it("maps localized countries without database extensions",()=>{expect(notificationCountryCodes("chine")).toContain("CN");expect(notificationCountryCodes("الصين")).toContain("CN")});
 it("escapes SQL wildcards",()=>expect(escapeNotificationLike("a%b_c")).toBe("%a\\%b\\_c%"));
});
