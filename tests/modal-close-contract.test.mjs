import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const page = fs.readFileSync("app/page.tsx", "utf8");
const css = fs.readFileSync("app/globals.css", "utf8");

test("major full-screen modal wrappers expose a header close control", () => {
  assert.match(page, /function ModalClose/);
  for (const setter of ["setGroupsOpen", "setShiftOpen", "setShiftAdjustmentOpen", "setShiftRosterOpen", "setShiftRequestsOpen", "setAnnouncementsOpen", "setDashboardOpen", "setAuditLogsOpen", "setWorkRecordsOpen", "setMonthlyWorkOpen"]) {
    assert.match(page, new RegExp(`ModalClose onClose=\\{\\(\\) => ${setter}`));
  }
  assert.match(css, /\.modal-global-close/);
});
