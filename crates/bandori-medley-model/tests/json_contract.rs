use bandori_medley_model::FixedMedleyEvaluationInputV1;

const VALID_FIXED_MEDLEY: &str = include_str!("fixtures/valid-fixed-medley-v1.json");

#[test]
fn retained_json_fixture_decodes_and_validates() {
    let input: FixedMedleyEvaluationInputV1 =
        serde_json::from_str(VALID_FIXED_MEDLEY).expect("fixture must decode");
    input.validate().expect("fixture must validate");
}
