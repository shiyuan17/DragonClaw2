use std::env;
use std::fs;
use std::path::PathBuf;

fn escaped_string_literal(value: &str) -> String {
    format!("{value:?}")
}

fn main() {
    let manifest_dir = PathBuf::from(env::var("CARGO_MANIFEST_DIR").expect("CARGO_MANIFEST_DIR"));
    let data_dir = manifest_dir.join("..").join("src").join("data");
    let index_path = data_dir.join("agency-agent-index.json");
    let installable_ids_path = data_dir.join("agency-agent-installable-ids.json");
    let profile_dir = data_dir.join("agency-agent-profiles");
    let template_dir = data_dir.join("agency-agent-templates");
    let out_dir = PathBuf::from(env::var("OUT_DIR").expect("OUT_DIR"));
    let generated_path = out_dir.join("agency_agent_templates.rs");

    println!("cargo:rerun-if-changed={}", index_path.display());
    println!("cargo:rerun-if-changed={}", installable_ids_path.display());
    println!("cargo:rerun-if-changed={}", profile_dir.display());
    println!("cargo:rerun-if-changed={}", template_dir.display());

    let mut entries = fs::read_dir(&template_dir)
        .expect("read agency agent template dir")
        .filter_map(Result::ok)
        .filter(|entry| entry.path().extension().and_then(|value| value.to_str()) == Some("json"))
        .collect::<Vec<_>>();
    entries.sort_by_key(|entry| entry.file_name());

    let mut output = String::from("static AGENCY_AGENT_TEMPLATE_JSON: &[(&str, &str)] = &[\n");
    for entry in entries {
        let path = entry.path();
        println!("cargo:rerun-if-changed={}", path.display());
        let agent_id = path
            .file_stem()
            .and_then(|value| value.to_str())
            .expect("template file stem");
        let path_literal = escaped_string_literal(&path.to_string_lossy());
        output.push_str(&format!(
            "    ({}, include_str!({})),\n",
            escaped_string_literal(agent_id),
            path_literal
        ));
    }
    output.push_str("];\n");

    fs::write(generated_path, output).expect("write agency agent template include map");

    tauri_build::build()
}
