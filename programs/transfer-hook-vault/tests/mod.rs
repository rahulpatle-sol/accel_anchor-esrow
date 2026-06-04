use transfer_hook_vault::instructions::transfer_hook::is_whitelisted;
use transfer_hook_vault::MAX_WHITELIST;
use transfer_hook_vault::VaultConfig;
use transfer_hook_vault::WhitelistEntry;

#[test]
fn test_is_whitelisted_returns_true_for_whitelisted_user() {
    let user = solana_pubkey::Pubkey::new_unique();
    let other_user = solana_pubkey::Pubkey::new_unique();

    let config = VaultConfig {
        authority: solana_pubkey::Pubkey::new_unique(),
        mint: solana_pubkey::Pubkey::new_unique(),
        vault: solana_pubkey::Pubkey::new_unique(),
        bump: 255,
        whitelist_count: 1,
        whitelist: {
            let mut w = [WhitelistEntry::default(); MAX_WHITELIST];
            w[0] = WhitelistEntry {
                user,
                max_deposit: 100,
                max_withdraw: 50,
            };
            
        },
    };

    assert!(is_whitelisted(&config, user));
    assert!(!is_whitelisted(&config, other_user));
}

#[test]
fn test_is_whitelisted_empty_list() {
    let user = solana_pubkey::Pubkey::new_unique();
    let config = VaultConfig {
        authority: solana_pubkey::Pubkey::new_unique(),
        mint: solana_pubkey::Pubkey::new_unique(),
        vault: solana_pubkey::Pubkey::new_unique(),
        bump: 255,
        whitelist_count: 0,
        whitelist: [WhitelistEntry::default(); MAX_WHITELIST],
    };
    assert!(!is_whitelisted(&config, user));
}

#[test]
fn test_is_whitelisted_multiple_entries() {
    let user1 = solana_pubkey::Pubkey::new_unique();
    let user2 = solana_pubkey::Pubkey::new_unique();
    let user3 = solana_pubkey::Pubkey::new_unique();

    let mut w = [WhitelistEntry::default(); MAX_WHITELIST];
    w[0] = WhitelistEntry {
        user: user1,
        max_deposit: 10,
        max_withdraw: 10,
    };
    w[1] = WhitelistEntry {
        user: user2,
        max_deposit: 20,
        max_withdraw: 20,
    };

    let config = VaultConfig {
        authority: solana_pubkey::Pubkey::new_unique(),
        mint: solana_pubkey::Pubkey::new_unique(),
        vault: solana_pubkey::Pubkey::new_unique(),
        bump: 255,
        whitelist_count: 2,
        whitelist: w,
    };

    assert!(is_whitelisted(&config, user1));
    assert!(is_whitelisted(&config, user2));
    assert!(!is_whitelisted(&config, user3));
}
