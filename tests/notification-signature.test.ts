import {describe,it,expect} from "vitest";
import {notificationStatusChange,notificationAgeMinutes} from "../src/app/portal/notifications/notification-signature";
describe("notification signature",()=>{
 it("uses only generated transition text for its actual case",()=>expect(notificationStatusChange("STATUS_CHANGED","Application EVT-1: Approved","Status changed from Submitted to Approved. Note: confidential note","EVT-1")).toEqual({from:"Submitted",to:"Approved"}));
 it("rejects other events, mismatched case or unstructured body",()=>{expect(notificationStatusChange("MESSAGE_POSTED","Application EVT-1: Approved","Status changed from Submitted to Approved.","EVT-1")).toBeNull();expect(notificationStatusChange("STATUS_CHANGED","Application EVT-2: Approved","Status changed from Submitted to Approved.","EVT-1")).toBeNull();expect(notificationStatusChange("STATUS_CHANGED","Application EVT-1: Approved","Updated","EVT-1")).toBeNull()});
 it("reports elapsed time without inventing a deadline",()=>{expect(notificationAgeMinutes(new Date(0),new Date(3600000))).toBe(60);expect(notificationAgeMinutes(new Date(1000),new Date(0))).toBeNull()});
});
