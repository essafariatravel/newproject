import { describe, expect,it } from "vitest";
import { POPOVER_EXIT_DELAY,shouldSchedulePointerClose } from "../src/components/agency-popover-policy";
describe("agency menu pointer policy",()=>{
 it("closes only when mouse leaves the complete menu",()=>{expect(shouldSchedulePointerClose("mouse","mouse",false)).toBe(true);expect(shouldSchedulePointerClose("mouse","mouse",true)).toBe(false)});
 it("preserves keyboard navigation and touch interaction",()=>{expect(shouldSchedulePointerClose("mouse","keyboard",false)).toBe(false);expect(shouldSchedulePointerClose("touch","touch",false)).toBe(false);expect(shouldSchedulePointerClose("pen","mouse",false)).toBe(false)});
 it("allows crossing the trigger-to-panel gap",()=>{expect(POPOVER_EXIT_DELAY).toBeGreaterThanOrEqual(150);expect(POPOVER_EXIT_DELAY).toBeLessThanOrEqual(250)});
});
