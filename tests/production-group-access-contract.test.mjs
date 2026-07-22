import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const schema = fs.readFileSync("db/schema.ts", "utf8");
const migration = fs.readFileSync("drizzle/0038_add_site_users_and_private_groups.sql", "utf8");
const groupsApi = fs.readFileSync("app/api/groups/route.ts", "utf8");
const joinApi = fs.readFileSync("app/api/groups/[id]/join/route.ts", "utf8");
const invitationApi = fs.readFileSync("app/api/groups/[id]/invitations/route.ts", "utf8");
const siteApi = fs.readFileSync("app/api/site/users/route.ts", "utf8");

test("production group access has site-user and private invite-only data", () => {
  assert.match(schema, /export const siteUsers = sqliteTable\("site_users"/);
  assert.match(schema, /canCreateGroups/);
  assert.match(schema, /authIdentities = sqliteTable\("auth_identities"/);
  assert.match(schema, /siteSessions = sqliteTable\("site_sessions"/);
  assert.match(schema, /participationMode/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `site_users`/);
  assert.match(migration, /ALTER TABLE `groups` ADD COLUMN `participation_mode`/);
  assert.match(migration, /CREATE TABLE IF NOT EXISTS `group_invitations`/);
});

test("group creation and joining enforce the production policy", () => {
  assert.match(groupsApi, /canCreateGroups\(user\.email\)/);
  assert.match(groupsApi, /visibility: "private", participationMode: "invite_only"/);
  assert.match(joinApi, /group\.participationMode !== "request_to_join"/);
  assert.match(invitationApi, /action === "accept"/);
  assert.match(invitationApi, /先にサイト利用者として承認してください/);
});

test("site administration exposes invitation and permission changes", () => {
  assert.match(siteApi, /requireSiteAdmin\(user\.email\)/);
  assert.match(siteApi, /siteInvitations/);
  assert.match(siteApi, /canCreateGroups/);
  assert.match(siteApi, /isSiteAdmin/);
});
