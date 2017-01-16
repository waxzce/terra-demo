"use strict";
const assert = require('chai').assert;

describe("geek value equals 42", () => {
  let geek = 42;
  it("should return 42", () => {
    assert.equal(geek, 42)
  });
});
