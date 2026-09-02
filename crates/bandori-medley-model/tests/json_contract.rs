use bandori_medley_model::{ValidationCode, decode_fixed_medley_evaluation_json};

const VALID_FIXED_MEDLEY: &str = include_str!("fixtures/valid-fixed-medley-v1.json");

#[test]
fn retained_json_fixture_decodes_and_validates() {
    decode_fixed_medley_evaluation_json(VALID_FIXED_MEDLEY)
        .expect("fixture must strictly decode and validate");
}

#[test]
fn public_decoder_returns_a_stable_decode_failure() {
    let malformed = VALID_FIXED_MEDLEY.replacen(
        "\"scoringRulesVersion\"",
        "\"unknownField\":1,\"scoringRulesVersion\"",
        1,
    );
    let error = decode_fixed_medley_evaluation_json(&malformed)
        .expect_err("unknown normalized fields must fail decoding");
    assert_eq!(error.code, ValidationCode::DecodeFailed);
    assert_eq!(error.path, "$");
}
