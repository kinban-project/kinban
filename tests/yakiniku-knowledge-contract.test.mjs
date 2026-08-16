import assert from "node:assert/strict";
import fs from "node:fs";
import test from "node:test";

const seeds = [
  fs.readFileSync("scripts/seed-local.sql", "utf8"),
  fs.readFileSync("scripts/seed-yakiniku.sql", "utf8"),
];

const guides = [
  ["meat", "焼肉店・肉場ガイド"],
  ["salad-soup", "焼肉店・サラダ場・スープ場ガイド"],
  ["drink", "焼肉店・ドリンク場ガイド"],
  ["wash", "焼肉店・洗い場ガイド"],
  ["hall", "焼肉店・ホール接客ガイド"],
  ["waiting", "焼肉店・ウェイティングガイド"],
];

test("yakiniku seeds contain published position guides", () => {
  for (const seed of seeds) {
    for (const [id, title] of guides) {
      assert.match(seed, new RegExp(`knowledge-yakiniku-${id}-guide`));
      assert.match(seed, new RegExp(title));
    }
    assert.match(seed, /ガイドに記載がないため店長へ確認してください/);
  }
});

test("yakiniku meat guide includes the embedded image", () => {
  assert.ok(fs.existsSync("public/knowledge/yakiniku-meat-prep.png"));
  assert.match(seeds[0], /knowledge-yakiniku-meat-guide[\s\S]*yakiniku-meat-prep\.png/);
  assert.match(seeds[1], /knowledge-yakiniku-meat-guide[\s\S]*yakiniku-meat-prep\.png/);
});

test("yakiniku meat guide includes fixed store rules and dimensions", () => {
  for (const seed of seeds) {
    assert.match(seed, /肉場の盛り付けルール/);
    assert.match(seed, /カルビ[\s\S]*8枚[\s\S]*縦6cm × 横4cm × 厚さ0\.3cm/);
    assert.match(seed, /盛り合わせA[\s\S]*合計12枚/);
    assert.match(seed, /肉場の最終確認/);
  }
});

test("yakiniku seed normalizes literal backslash-n safely in SQLite", () => {
  for (const seed of seeds) {
    assert.match(seed, /replace\(body, char\(92\) \|\| 'n', char\(10\)\)/);
  }
});
