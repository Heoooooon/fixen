"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const fx = require("../bin/fixen.js");

test("registry package version validation accepts strict semver only", () => {
  assert.equal(fx.validPackageVersion("1.2.3"), true);
  assert.equal(fx.validPackageVersion("1.2.3-rc.10+build.5"), true);
  assert.equal(fx.validPackageVersion("1.2"), false);
  assert.equal(fx.validPackageVersion("latest"), false);
  assert.equal(fx.validPackageVersion("1.2.3 extra"), false);
});
