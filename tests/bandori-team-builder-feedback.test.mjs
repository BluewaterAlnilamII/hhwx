import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { createTranslator } from "next-intl";
import { searchInputMessageKey, searchOutcomeNotice } from "../src/app/[locale]/bandori/teambuilder/team-search-feedback.ts";

for (const locale of ["zh-CN", "en"]) {
  const messages = JSON.parse(readFileSync(new URL(`../messages/${locale}/bandori.json`, import.meta.url), "utf8"));
  const translate = namespace => createTranslator({ locale, messages, namespace: `teamBuilder.${namespace}`,
    onError(error) { throw error; } });
  test(`search completion distinguishes empty and unfinished results in ${locale}`, () => {
    const t = translate("proof");
    assert.equal(searchOutcomeNotice("exact", null, 0, t), locale === "zh-CN" ? "没有符合条件的队伍" : "No matching team");
    assert.equal(searchOutcomeNotice("exact", null, 1, t), null);
    const empty = searchOutcomeNotice("incomplete", "arithmetic_overflow", 0, t);
    const retained = searchOutcomeNotice("incomplete", "arithmetic_overflow", 1, t);
    assert.equal(empty, locale === "zh-CN" ? "数值超出范围，尚未找到队伍" : "Value out of range. No team found yet.");
    assert.equal(retained, locale === "zh-CN" ? "数值超出范围，显示当前最佳队伍" : "Value out of range. Showing the best team found so far.");
    for (const reason of ["timed_out", "memory_exhausted", "cancelled", "invalid_data", "scorer_disagreement", "internal_failure", "count_or_index_overflow"]) {
      assert.notEqual(searchOutcomeNotice("incomplete", reason, 0, t), t("noMatchingTeam"));
    }
  });
  test(`input errors use the field reported by the solver in ${locale}`, () => {
    const t = translate("errors");
    const message = (path, code = "INVALID_CARD") => t(searchInputMessageKey({ code, path }));
    assert.match(message("song.notes"), /16,384/);
    assert.notEqual(message("song.notes[40].timeSeconds"), message("song.notes"));
    assert.equal(message("otherPlayersAveragePower", "INVALID_PARAMETER"), message("otherPlayersPower"));
    assert.notEqual(message("scoreRange"), message("supportPowers"));
  });
}
