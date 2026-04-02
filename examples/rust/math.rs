pub fn add(left: i64, right: i64) -> i64 {
    left + right
}

pub fn scale(values: Vec<i64>, factor: i64) -> Vec<i64> {
    values.into_iter().map(|value| value * factor).collect()
}

pub fn average(values: Vec<f64>) -> f64 {
    if values.is_empty() {
        return 0.0;
    }

    let total: f64 = values.iter().sum();
    total / values.len() as f64
}

pub fn greet(name: String) -> String {
    format!("Hello, {} from Rust", name)
}
