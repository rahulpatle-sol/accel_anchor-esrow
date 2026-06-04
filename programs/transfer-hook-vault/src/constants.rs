use anchor_lang::prelude::*;

#[constant]
pub const VAULT_CONFIG_SEED: &[u8] = b"vault_config";

#[constant]
pub const WHITELIST_SEED: &[u8] = b"whitelist";

#[constant]
pub const MAX_WHITELIST: usize = 10;
