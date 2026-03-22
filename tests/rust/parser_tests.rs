use app_lib::parser::*;

fn sample_html() -> &'static str {
    r#"
    <article class="battle_data_battle_data__zKb2c ">
        <div class="battle_data_inner__erFEC">
            <ul class="battle_data_battlelog__list__JNDjG">
                <li data-index="0">
                    <div class="battle_data_inner_log__p5QL6">
                        <div class="battle_data_name_space__iCss5">
                            <p class="battle_data_name_p1__Ookss"><span class="battle_data_platform__8y0GW"></span><span class="battle_data_name__IPyjF">PlayerA</span></p>
                            <p class="battle_data_date__f1sP6">03/19/2026 21:33</p>
                            <p class="battle_data_name_p2__ua7Oo"><span class="battle_data_platform__8y0GW"></span><span class="battle_data_name__IPyjF">PlayerB</span></p>
                        </div>
                        <div class="battle_data_player1__MIpvf battle_data_win__8Y4Me">
                            <ul>
                                <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype0.png"></li>
                                <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank27_s.png"></li>
                                <li class="battle_data_lp__6v5G9">15243 LP</li>
                            </ul>
                        </div>
                        <div class="battle_data_player2__tymNR battle_data_lose__ltUN0">
                            <ul>
                                <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype1.png"></li>
                                <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank26_s.png"></li>
                                <li class="battle_data_lp__6v5G9">15063 LP</li>
                            </ul>
                        </div>
                    </div>
                </li>
                <li data-index="1">
                    <div class="battle_data_inner_log__p5QL6">
                        <div class="battle_data_name_space__iCss5">
                            <p class="battle_data_name_p1__Ookss"><span class="battle_data_platform__8y0GW"></span><span class="battle_data_name__IPyjF">PlayerB</span></p>
                            <p class="battle_data_date__f1sP6">03/19/2026 21:31</p>
                            <p class="battle_data_name_p2__ua7Oo"><span class="battle_data_platform__8y0GW"></span><span class="battle_data_name__IPyjF">TestPlayer</span></p>
                        </div>
                        <div class="battle_data_player1__MIpvf battle_data_lose__ltUN0">
                            <ul>
                                <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype1.png"></li>
                                <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank24_s.png"></li>
                                <li class="battle_data_lp__6v5G9">14500 LP</li>
                            </ul>
                        </div>
                        <div class="battle_data_player2__tymNR battle_data_win__8Y4Me">
                            <ul>
                                <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype0.png"></li>
                                <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank19_s.png"></li>
                                <li class="battle_data_lp__6v5G9">12000 LP</li>
                            </ul>
                        </div>
                    </div>
                </li>
            </ul>
        </div>
    </article>
    "#
}

#[test]
fn test_parse_entry_count() {
    let entries = parse_battle_data(sample_html());
    assert_eq!(entries.len(), 2);
}

#[test]
fn test_parse_first_entry() {
    let entries = parse_battle_data(sample_html());
    let e = &entries[0];

    assert_eq!(e.date, "03/19/2026 21:33");
    assert_eq!(e.player1_name, "PlayerA");
    assert_eq!(e.player2_name, "PlayerB");
    assert_eq!(e.player1_result, "WIN");
    assert_eq!(e.player2_result, "LOSE");
    assert_eq!(e.player1_rank, "Master");
    assert_eq!(e.player2_rank, "Master");
    assert_eq!(e.player1_control, "Classic");
    assert_eq!(e.player2_control, "Modern");
    assert_eq!(e.player1_score_type, ScoreType::LP);
    assert_eq!(e.player1_score, 15243);
    assert_eq!(e.player2_score_type, ScoreType::LP);
    assert_eq!(e.player2_score, 15063);
}

#[test]
fn test_parse_second_entry_reversed_result() {
    let entries = parse_battle_data(sample_html());
    let e = &entries[1];

    assert_eq!(e.date, "03/19/2026 21:31");
    assert_eq!(e.player1_name, "PlayerB");
    assert_eq!(e.player2_name, "TestPlayer");
    assert_eq!(e.player1_result, "LOSE");
    assert_eq!(e.player2_result, "WIN");
    assert_eq!(e.player1_rank, "Master");
    assert_eq!(e.player2_rank, "Diamond 1");
    assert_eq!(e.player1_control, "Modern");
    assert_eq!(e.player2_control, "Classic");
    assert_eq!(e.player1_score_type, ScoreType::LP);
    assert_eq!(e.player1_score, 14500);
    assert_eq!(e.player2_score_type, ScoreType::LP);
    assert_eq!(e.player2_score, 12000);
}

#[test]
fn test_parse_empty_html() {
    let entries = parse_battle_data("<html><body></body></html>");
    assert!(entries.is_empty());
}

#[test]
fn test_parse_username() {
    let html = r#"
        <section class="status_personal__JO1zh">
            <ul class="status_personal__info__zU_gn">
                <li class="status_bbc_title__QLzS6">Brand NewMaster</li>
                <li class="status_name__gXNo9"><span class="status_platform__Pp1nu"><span></span></span><span class="status_name__gXNo9">PlayerB</span></li>
                <li class="status_sid__P91rn">User Code:0000000000</li>
            </ul>
        </section>
    "#;
    assert_eq!(parse_username(html), Some("PlayerB".to_string()));
}

#[test]
fn test_parse_username_not_found() {
    assert_eq!(parse_username("<html><body></body></html>"), None);
}

// ============================================================
// parse_score tests
// ============================================================

#[test]
fn test_parse_score_lp() {
    let (t, v) = parse_score("15243 LP");
    assert_eq!(t, ScoreType::LP);
    assert_eq!(v, 15243);
}

#[test]
fn test_parse_score_mr() {
    let (t, v) = parse_score("1500 MR");
    assert_eq!(t, ScoreType::MR);
    assert_eq!(v, 1500);
}

#[test]
fn test_parse_score_lp_with_whitespace() {
    let (t, v) = parse_score("  25000 LP  ");
    assert_eq!(t, ScoreType::LP);
    assert_eq!(v, 25000);
}

#[test]
fn test_parse_score_mr_with_whitespace() {
    let (t, v) = parse_score("  1800 MR  ");
    assert_eq!(t, ScoreType::MR);
    assert_eq!(v, 1800);
}

#[test]
fn test_parse_score_zero_lp() {
    let (t, v) = parse_score("0 LP");
    assert_eq!(t, ScoreType::LP);
    assert_eq!(v, 0);
}

#[test]
fn test_parse_score_zero_mr() {
    let (t, v) = parse_score("0 MR");
    assert_eq!(t, ScoreType::MR);
    assert_eq!(v, 0);
}

#[test]
fn test_parse_score_large_lp() {
    let (t, v) = parse_score("99999 LP");
    assert_eq!(t, ScoreType::LP);
    assert_eq!(v, 99999);
}

#[test]
fn test_parse_score_large_mr() {
    let (t, v) = parse_score("2500 MR");
    assert_eq!(t, ScoreType::MR);
    assert_eq!(v, 2500);
}

#[test]
fn test_parse_score_unknown_suffix() {
    let (t, v) = parse_score("500 XP");
    assert_eq!(t, ScoreType::Unknown);
    assert_eq!(v, 500);
}

#[test]
fn test_parse_score_pure_number() {
    let (t, v) = parse_score("12345");
    assert_eq!(t, ScoreType::Unknown);
    assert_eq!(v, 12345);
}

#[test]
fn test_parse_score_empty_string() {
    let (t, v) = parse_score("");
    assert_eq!(t, ScoreType::Unknown);
    assert_eq!(v, 0);
}

#[test]
fn test_parse_score_only_whitespace() {
    let (t, v) = parse_score("   ");
    assert_eq!(t, ScoreType::Unknown);
    assert_eq!(v, 0);
}

#[test]
fn test_parse_score_no_digits() {
    let (t, v) = parse_score("LP");
    assert_eq!(t, ScoreType::LP);
    assert_eq!(v, 0);
}

// ============================================================
// rank_number_to_name tests
// ============================================================

#[test]
fn test_rank_rookie() {
    assert_eq!(rank_number_to_name(1), "Rookie 1");
    assert_eq!(rank_number_to_name(2), "Rookie 2");
    assert_eq!(rank_number_to_name(3), "Rookie 3");
}

#[test]
fn test_rank_iron() {
    assert_eq!(rank_number_to_name(4), "Iron 1");
    assert_eq!(rank_number_to_name(5), "Iron 2");
    assert_eq!(rank_number_to_name(6), "Iron 3");
}

#[test]
fn test_rank_bronze() {
    assert_eq!(rank_number_to_name(7), "Bronze 1");
    assert_eq!(rank_number_to_name(8), "Bronze 2");
    assert_eq!(rank_number_to_name(9), "Bronze 3");
}

#[test]
fn test_rank_silver() {
    assert_eq!(rank_number_to_name(10), "Silver 1");
    assert_eq!(rank_number_to_name(11), "Silver 2");
    assert_eq!(rank_number_to_name(12), "Silver 3");
}

#[test]
fn test_rank_gold() {
    assert_eq!(rank_number_to_name(13), "Gold 1");
    assert_eq!(rank_number_to_name(14), "Gold 2");
    assert_eq!(rank_number_to_name(15), "Gold 3");
}

#[test]
fn test_rank_platinum() {
    assert_eq!(rank_number_to_name(16), "Platinum 1");
    assert_eq!(rank_number_to_name(17), "Platinum 2");
    assert_eq!(rank_number_to_name(18), "Platinum 3");
}

#[test]
fn test_rank_diamond() {
    assert_eq!(rank_number_to_name(19), "Diamond 1");
    assert_eq!(rank_number_to_name(20), "Diamond 2");
    assert_eq!(rank_number_to_name(21), "Diamond 3");
    assert_eq!(rank_number_to_name(22), "Diamond 4");
    assert_eq!(rank_number_to_name(23), "Diamond 5");
}

#[test]
fn test_rank_master() {
    for n in 24..=28 {
        assert_eq!(rank_number_to_name(n), "Master");
    }
}

#[test]
fn test_rank_legend() {
    assert_eq!(rank_number_to_name(29), "Legend");
}

#[test]
fn test_rank_unknown_zero() {
    assert_eq!(rank_number_to_name(0), "Unknown(0)");
}

#[test]
fn test_rank_unknown_high() {
    assert_eq!(rank_number_to_name(30), "Unknown(30)");
    assert_eq!(rank_number_to_name(100), "Unknown(100)");
}

// ============================================================
// control_type_name tests
// ============================================================

#[test]
fn test_control_classic() {
    assert_eq!(control_type_name(0), "Classic");
}

#[test]
fn test_control_modern() {
    assert_eq!(control_type_name(1), "Modern");
}

#[test]
fn test_control_dynamic() {
    assert_eq!(control_type_name(2), "Dynamic");
}

#[test]
fn test_control_unknown() {
    assert_eq!(control_type_name(3), "Unknown");
    assert_eq!(control_type_name(99), "Unknown");
}

// ============================================================
// parse_username additional tests
// ============================================================

#[test]
fn test_parse_username_with_spaces() {
    let html = r#"
        <section class="status_personal__JO1zh">
            <ul class="status_personal__info__zU_gn">
                <li class="status_name__gXNo9"><span class="status_name__gXNo9">  Player Name  </span></li>
            </ul>
        </section>
    "#;
    assert_eq!(parse_username(html), Some("Player Name".to_string()));
}

#[test]
fn test_parse_username_japanese() {
    let html = r#"
        <section class="status_personal__ABC12">
            <ul>
                <li class="status_name__XYZ99">テストプレイヤー</li>
            </ul>
        </section>
    "#;
    assert_eq!(parse_username(html), Some("テストプレイヤー".to_string()));
}

#[test]
fn test_parse_username_empty_html() {
    assert_eq!(parse_username(""), None);
}

// ============================================================
// parse_battle_data additional tests
// ============================================================

fn sample_mr_html() -> &'static str {
    r#"
    <ul class="battle_data_battlelog__list__JNDjG">
        <li data-index="0">
            <div class="battle_data_inner_log__p5QL6">
                <div class="battle_data_name_space__iCss5">
                    <p class="battle_data_name_p1__Ookss"><span class="battle_data_name__IPyjF">MRPlayer1</span></p>
                    <p class="battle_data_date__f1sP6">03/20/2026 10:00</p>
                    <p class="battle_data_name_p2__ua7Oo"><span class="battle_data_name__IPyjF">MRPlayer2</span></p>
                </div>
                <div class="battle_data_player1__MIpvf battle_data_win__8Y4Me">
                    <ul>
                        <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype0.png"></li>
                        <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank29_s.png"></li>
                        <li class="battle_data_lp__6v5G9">1800 MR</li>
                    </ul>
                </div>
                <div class="battle_data_player2__tymNR battle_data_lose__ltUN0">
                    <ul>
                        <li class="battle_data_control__D3DGU"><img src="/6/buckler/assets/images/common/icon_controltype2.png"></li>
                        <li class="battle_data_rank__NM77e"><img src="/6/buckler/assets/images/material/rank/rank29_s.png"></li>
                        <li class="battle_data_lp__6v5G9">1750 MR</li>
                    </ul>
                </div>
            </div>
        </li>
    </ul>
    "#
}

#[test]
fn test_parse_mr_entry() {
    let entries = parse_battle_data(sample_mr_html());
    assert_eq!(entries.len(), 1);
    let e = &entries[0];
    assert_eq!(e.player1_name, "MRPlayer1");
    assert_eq!(e.player2_name, "MRPlayer2");
    assert_eq!(e.player1_score_type, ScoreType::MR);
    assert_eq!(e.player1_score, 1800);
    assert_eq!(e.player2_score_type, ScoreType::MR);
    assert_eq!(e.player2_score, 1750);
    assert_eq!(e.player1_result, "WIN");
    assert_eq!(e.player2_result, "LOSE");
    assert_eq!(e.player1_rank, "Legend");
    assert_eq!(e.player2_rank, "Legend");
    assert_eq!(e.player1_control, "Classic");
    assert_eq!(e.player2_control, "Dynamic");
    assert_eq!(e.date, "03/20/2026 10:00");
}

#[test]
fn test_parse_single_entry() {
    let html = r#"
    <ul>
        <li data-index="0">
            <div>
                <div>
                    <p class="battle_data_name_p1__Abc"><span class="battle_data_name__Xyz">Solo</span></p>
                    <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                    <p class="battle_data_name_p2__Def"><span class="battle_data_name__Xyz">Opponent</span></p>
                </div>
                <div class="battle_data_player1__MIpvf battle_data_win__ABC">
                    <ul>
                        <li class="battle_data_lp__XYZ">5000 LP</li>
                    </ul>
                </div>
                <div class="battle_data_player2__tymNR battle_data_lose__DEF">
                    <ul>
                        <li class="battle_data_lp__XYZ">4000 LP</li>
                    </ul>
                </div>
            </div>
        </li>
    </ul>
    "#;
    let entries = parse_battle_data(html);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].player1_name, "Solo");
    assert_eq!(entries[0].player2_name, "Opponent");
    assert_eq!(entries[0].player1_score, 5000);
    assert_eq!(entries[0].player2_score, 4000);
}

#[test]
fn test_parse_entry_missing_rank_and_control() {
    let html = r#"
    <ul>
        <li data-index="0">
            <div>
                <div>
                    <p class="battle_data_name_p1__Abc"><span class="battle_data_name__Xyz">P1</span></p>
                    <p class="battle_data_date__f1sP6">02/15/2026 12:00</p>
                    <p class="battle_data_name_p2__Def"><span class="battle_data_name__Xyz">P2</span></p>
                </div>
                <div class="battle_data_player1__MIpvf battle_data_lose__ABC">
                    <ul>
                        <li class="battle_data_lp__XYZ">3000 LP</li>
                    </ul>
                </div>
                <div class="battle_data_player2__tymNR battle_data_win__DEF">
                    <ul>
                        <li class="battle_data_lp__XYZ">3500 LP</li>
                    </ul>
                </div>
            </div>
        </li>
    </ul>
    "#;
    let entries = parse_battle_data(html);
    assert_eq!(entries.len(), 1);
    let e = &entries[0];
    assert_eq!(e.player1_rank, "");
    assert_eq!(e.player2_rank, "");
    assert_eq!(e.player1_control, "");
    assert_eq!(e.player2_control, "");
    assert_eq!(e.player1_result, "LOSE");
    assert_eq!(e.player2_result, "WIN");
}

#[test]
fn test_parse_entry_missing_score() {
    let html = r#"
    <ul>
        <li data-index="0">
            <div>
                <div>
                    <p class="battle_data_name_p1__Abc"><span class="battle_data_name__Xyz">NoScore1</span></p>
                    <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                    <p class="battle_data_name_p2__Def"><span class="battle_data_name__Xyz">NoScore2</span></p>
                </div>
                <div class="battle_data_player1__MIpvf battle_data_win__ABC">
                    <ul></ul>
                </div>
                <div class="battle_data_player2__tymNR battle_data_lose__DEF">
                    <ul></ul>
                </div>
            </div>
        </li>
    </ul>
    "#;
    let entries = parse_battle_data(html);
    assert_eq!(entries.len(), 1);
    let e = &entries[0];
    assert_eq!(e.player1_score_type, ScoreType::Unknown);
    assert_eq!(e.player1_score, 0);
    assert_eq!(e.player2_score_type, ScoreType::Unknown);
    assert_eq!(e.player2_score, 0);
}

#[test]
fn test_parse_entry_missing_names() {
    let html = r#"
    <ul>
        <li data-index="0">
            <div>
                <div>
                    <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                </div>
                <div class="battle_data_player1__MIpvf battle_data_win__ABC">
                    <ul>
                        <li class="battle_data_lp__XYZ">1000 LP</li>
                    </ul>
                </div>
                <div class="battle_data_player2__tymNR battle_data_lose__DEF">
                    <ul>
                        <li class="battle_data_lp__XYZ">900 LP</li>
                    </ul>
                </div>
            </div>
        </li>
    </ul>
    "#;
    let entries = parse_battle_data(html);
    assert_eq!(entries.len(), 1);
    assert_eq!(entries[0].player1_name, "");
    assert_eq!(entries[0].player2_name, "");
}

#[test]
fn test_parse_no_li_entries() {
    let html = r#"<ul class="battle_data_battlelog__list__JNDjG"></ul>"#;
    let entries = parse_battle_data(html);
    assert!(entries.is_empty());
}

#[test]
fn test_parse_all_rookie_ranks() {
    let html = r#"
    <ul>
        <li data-index="0">
            <div>
                <div>
                    <p class="battle_data_name_p1__Abc"><span class="battle_data_name__Xyz">R1</span></p>
                    <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                    <p class="battle_data_name_p2__Def"><span class="battle_data_name__Xyz">R2</span></p>
                </div>
                <div class="battle_data_player1__MIpvf battle_data_win__ABC">
                    <ul>
                        <li><img src="/6/buckler/assets/images/material/rank/rank1_s.png"></li>
                        <li class="battle_data_lp__XYZ">100 LP</li>
                    </ul>
                </div>
                <div class="battle_data_player2__tymNR battle_data_lose__DEF">
                    <ul>
                        <li><img src="/6/buckler/assets/images/material/rank/rank3_s.png"></li>
                        <li class="battle_data_lp__XYZ">200 LP</li>
                    </ul>
                </div>
            </div>
        </li>
    </ul>
    "#;
    let entries = parse_battle_data(html);
    assert_eq!(entries[0].player1_rank, "Rookie 1");
    assert_eq!(entries[0].player2_rank, "Rookie 3");
}

// ============================================================
// try_parse_battle_page tests
// ============================================================

#[test]
fn test_try_parse_battle_page_valid_json_with_entries() {
    let html = sample_html();
    let json = serde_json::json!({ "html": html }).to_string();
    let result = try_parse_battle_page(&json);
    assert!(result.is_some());
    let update = result.unwrap();
    assert_eq!(update.entries.len(), 2);
}

#[test]
fn test_try_parse_battle_page_valid_json_with_username() {
    let html = r#"
        <section class="status_personal__JO1zh">
            <ul><li class="status_name__gXNo9">TestUser</li></ul>
        </section>
    "#;
    let json = serde_json::json!({ "html": html }).to_string();
    let result = try_parse_battle_page(&json);
    assert!(result.is_some());
    let update = result.unwrap();
    assert_eq!(update.username, Some("TestUser".to_string()));
    assert!(update.entries.is_empty());
}

#[test]
fn test_try_parse_battle_page_invalid_json() {
    let result = try_parse_battle_page("not json at all");
    assert!(result.is_none());
}

#[test]
fn test_try_parse_battle_page_json_without_html_key() {
    let json = serde_json::json!({ "data": "something" }).to_string();
    let result = try_parse_battle_page(&json);
    assert!(result.is_none());
}

#[test]
fn test_try_parse_battle_page_empty_html() {
    let json = serde_json::json!({ "html": "<html></html>" }).to_string();
    let result = try_parse_battle_page(&json);
    assert!(result.is_none()); // no entries and no username
}

#[test]
fn test_try_parse_battle_page_html_null() {
    let json = serde_json::json!({ "html": null }).to_string();
    let result = try_parse_battle_page(&json);
    assert!(result.is_none());
}

#[test]
fn test_try_parse_battle_page_empty_string() {
    let result = try_parse_battle_page("");
    assert!(result.is_none());
}

#[test]
fn test_try_parse_battle_page_both_username_and_entries() {
    let html = format!(
        r#"
        <section class="status_personal__ABC">
            <ul><li class="status_name__XYZ">MyUser</li></ul>
        </section>
        {}
        "#,
        // Inline a single battle entry
        r#"
        <ul>
            <li data-index="0">
                <div>
                    <div>
                        <p class="battle_data_name_p1__A"><span class="battle_data_name__B">P1</span></p>
                        <p class="battle_data_date__f1sP6">01/01/2026 00:00</p>
                        <p class="battle_data_name_p2__C"><span class="battle_data_name__D">P2</span></p>
                    </div>
                    <div class="battle_data_player1__MIpvf battle_data_win__E">
                        <ul><li class="battle_data_lp__F">1000 LP</li></ul>
                    </div>
                    <div class="battle_data_player2__tymNR battle_data_lose__G">
                        <ul><li class="battle_data_lp__H">900 LP</li></ul>
                    </div>
                </div>
            </li>
        </ul>
        "#
    );
    let json = serde_json::json!({ "html": html }).to_string();
    let result = try_parse_battle_page(&json);
    assert!(result.is_some());
    let update = result.unwrap();
    assert_eq!(update.username, Some("MyUser".to_string()));
    assert_eq!(update.entries.len(), 1);
}
