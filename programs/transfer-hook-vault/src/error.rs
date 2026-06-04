use anchor_lang::prelude::*;

#[error_code]
pub enum ErrorCode {
    #[msg("Not whitelisted")]
    NotWhitelisted,
    #[msg("Whitelist is full")]
    WhitelistFull,
    #[msg("Already whitelisted")]
    AlreadyWhitelisted,
    #[msg("Not the vault authority")]
    NotAuthority,
    #[msg("Exceeds max deposit")]
    ExceedsMaxDeposit,
    #[msg("Exceeds max withdraw")]
    ExceedsMaxWithdraw,
    #[msg("Transfer hook: source not whitelisted")]
    TransferHookSourceNotWhitelisted,
    #[msg("Transfer hook: destination not whitelisted")]
    TransferHookDestNotWhitelisted,
    #[msg("Transfer hook: invalid extra account")]
    InvalidExtraAccount,
    #[msg("Arithmetic overflow")]
    ArithmeticOverflow,
}
