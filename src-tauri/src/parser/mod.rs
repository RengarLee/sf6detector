use regex::Regex;

#[derive(Debug, Clone, serde::Serialize, PartialEq, Eq)]
pub enum ScoreType {
    LP,
    MR,
    Unknown,
}

#[derive(Debug, serde::Serialize)]
pub struct BattleEntry {
    pub date: String,
    pub player1_name: String,
    pub player1_result: String,
    pub player1_rank: String,
    pub player1_control: String,
    pub player1_score_type: ScoreType,
    pub player1_score: i32,
    pub player2_name: String,
    pub player2_result: String,
    pub player2_rank: String,
    pub player2_control: String,
    pub player2_score_type: ScoreType,
    pub player2_score: i32,
}

#[derive(Debug, serde::Serialize)]
pub struct BattlelogUpdate {
    pub username: Option<String>,
    pub entries: Vec<BattleEntry>,
}

pub fn parse_score(raw: &str) -> (ScoreType, i32) {
    let trimmed = raw.trim();
    if trimmed.ends_with("LP") {
        let num_str: String = trimmed.chars().take_while(|c| c.is_ascii_digit() || *c == ' ').collect();
        let value = num_str.trim().parse::<i32>().unwrap_or(0);
        (ScoreType::LP, value)
    } else if trimmed.ends_with("MR") {
        let num_str: String = trimmed.chars().take_while(|c| c.is_ascii_digit() || *c == ' ').collect();
        let value = num_str.trim().parse::<i32>().unwrap_or(0);
        (ScoreType::MR, value)
    } else {
        let value = trimmed.chars().filter(|c| c.is_ascii_digit()).collect::<String>().parse::<i32>().unwrap_or(0);
        (ScoreType::Unknown, value)
    }
}

pub fn rank_number_to_name(n: u32) -> String {
    match n {
        1 => "Rookie 1".into(),
        2 => "Rookie 2".into(),
        3 => "Rookie 3".into(),
        4 => "Iron 1".into(),
        5 => "Iron 2".into(),
        6 => "Iron 3".into(),
        7 => "Bronze 1".into(),
        8 => "Bronze 2".into(),
        9 => "Bronze 3".into(),
        10 => "Silver 1".into(),
        11 => "Silver 2".into(),
        12 => "Silver 3".into(),
        13 => "Gold 1".into(),
        14 => "Gold 2".into(),
        15 => "Gold 3".into(),
        16 => "Platinum 1".into(),
        17 => "Platinum 2".into(),
        18 => "Platinum 3".into(),
        19 => "Diamond 1".into(),
        20 => "Diamond 2".into(),
        21 => "Diamond 3".into(),
        22 => "Diamond 4".into(),
        23 => "Diamond 5".into(),
        24 => "Master".into(),
        25 => "Master".into(),
        26 => "Master".into(),
        27 => "Master".into(),
        28 => "Master".into(),
        29 => "Legend".into(),
        _ => format!("Unknown({})", n),
    }
}

pub fn control_type_name(n: u32) -> &'static str {
    match n {
        0 => "Classic",
        1 => "Modern",
        2 => "Dynamic",
        _ => "Unknown",
    }
}

pub fn parse_username(html: &str) -> Option<String> {
    let re = Regex::new(r#"(?s)status_personal__\w+.*?status_name__\w+"[^>]*>([^<]+)<"#).unwrap();
    re.captures(html).map(|c| c[1].trim().to_string())
}

pub fn parse_battle_data(html: &str) -> Vec<BattleEntry> {
    let mut entries = Vec::new();

    // Split by each battle log entry: <li data-index="N">
    let re_entry = Regex::new(r#"<li data-index="\d+">"#).unwrap();
    let entry_positions: Vec<usize> = re_entry.find_iter(html).map(|m| m.start()).collect();

    let re_name_p1 = Regex::new(r#"battle_data_name_p1__\w+[^>]*>.*?battle_data_name__\w+"[^>]*>([^<]+)<"#).unwrap();
    let re_name_p2 = Regex::new(r#"battle_data_name_p2__\w+[^>]*>.*?battle_data_name__\w+"[^>]*>([^<]+)<"#).unwrap();
    let re_date = Regex::new(r#"battle_data_date__\w+"[^>]*>([^<]+)<"#).unwrap();
    let re_p1_div = Regex::new(r#"battle_data_player1__\w+\s+(battle_data_(win|lose)__\w+)"#).unwrap();
    let re_p2_div = Regex::new(r#"battle_data_player2__\w+\s+(battle_data_(win|lose)__\w+)"#).unwrap();
    let re_rank = Regex::new(r#"rank/rank(\d+)_s\.png"#).unwrap();
    let re_control = Regex::new(r#"icon_controltype(\d+)\.png"#).unwrap();
    let re_lp = Regex::new(r#"battle_data_lp__\w+"[^>]*>([^<]+)<"#).unwrap();

    for (i, &start) in entry_positions.iter().enumerate() {
        let end = if i + 1 < entry_positions.len() {
            entry_positions[i + 1]
        } else {
            html.len()
        };
        let block = &html[start..end];

        let date = re_date.find_iter(block).next()
            .and_then(|_| re_date.captures(block))
            .map(|c| c[1].trim().to_string())
            .unwrap_or_default();

        let p1_name = re_name_p1.captures(block)
            .map(|c| c[1].trim().to_string())
            .unwrap_or_default();

        let p2_name = re_name_p2.captures(block)
            .map(|c| c[1].trim().to_string())
            .unwrap_or_default();

        let p1_result = re_p1_div.captures(block)
            .map(|c| if &c[2] == "win" { "WIN" } else { "LOSE" }.to_string())
            .unwrap_or_default();

        let p2_result = re_p2_div.captures(block)
            .map(|c| if &c[2] == "win" { "WIN" } else { "LOSE" }.to_string())
            .unwrap_or_default();

        let ranks: Vec<String> = re_rank.captures_iter(block)
            .map(|c| rank_number_to_name(c[1].parse().unwrap_or(0)))
            .collect();

        let controls: Vec<String> = re_control.captures_iter(block)
            .map(|c| control_type_name(c[1].parse().unwrap_or(99)).to_string())
            .collect();

        let scores: Vec<(ScoreType, i32)> = re_lp.captures_iter(block)
            .map(|c| parse_score(c[1].trim()))
            .collect();

        let (p1_score_type, p1_score) = scores.first().cloned().unwrap_or((ScoreType::Unknown, 0));
        let (p2_score_type, p2_score) = scores.get(1).cloned().unwrap_or((ScoreType::Unknown, 0));

        entries.push(BattleEntry {
            date,
            player1_name: p1_name,
            player1_result: p1_result,
            player1_rank: ranks.first().cloned().unwrap_or_default(),
            player1_control: controls.first().cloned().unwrap_or_default(),
            player1_score_type: p1_score_type,
            player1_score: p1_score,
            player2_name: p2_name,
            player2_result: p2_result,
            player2_rank: ranks.get(1).cloned().unwrap_or_default(),
            player2_control: controls.get(1).cloned().unwrap_or_default(),
            player2_score_type: p2_score_type,
            player2_score: p2_score,
        });
    }

    entries
}

pub fn try_parse_battle_page(payload: &str) -> Option<BattlelogUpdate> {
    if let Ok(json) = serde_json::from_str::<serde_json::Value>(payload) {
        if let Some(html) = json.get("html").and_then(|v| v.as_str()) {
            let username = parse_username(html);
            let entries = parse_battle_data(html);
            if !entries.is_empty() || username.is_some() {
                println!("=== Parsed {} battle entries, username: {:?} ===", entries.len(), username);
                for (i, e) in entries.iter().enumerate() {
                    println!("  Battle {}: {} | {} ({} {:?} {}) vs {} ({} {:?} {})",
                        i + 1, e.date,
                        e.player1_name, e.player1_result, e.player1_score_type, e.player1_score,
                        e.player2_name, e.player2_result, e.player2_score_type, e.player2_score,
                    );
                }
                println!("================================");
                return Some(BattlelogUpdate { username, entries });
            }
        }
    }
    None
}

