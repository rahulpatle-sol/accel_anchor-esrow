use anchor_lang::prelude::*;
use anchor_spl::{
    token_2022::Token2022,
    token_interface::{self, Mint, TokenAccount, TransferChecked},
};

use crate::error::ErrorCode;
use crate::VaultConfig;

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub user: Signer<'info>,
    #[account(
        mut,
        seeds = [crate::VAULT_CONFIG_SEED],
        bump = vault_config.bump,
        has_one = mint,
        has_one = vault,
    )]
    pub vault_config: Account<'info, VaultConfig>,
    #[account(
        mint::token_program = token_program,
    )]
    pub mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = user,
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        token::mint = mint,
        token::authority = vault_config,
    )]
    pub vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Program<'info, Token2022>,
}

impl<'info> Deposit<'info> {
    pub fn deposit(&mut self, amount: u64) -> Result<()> {
        let config = &self.vault_config;
        let user_key = self.user.key();

        let mut found = false;
        for i in 0..config.whitelist_count as usize {
            if config.whitelist[i].user == user_key {
                require!(
                    amount <= config.whitelist[i].max_deposit,
                    ErrorCode::ExceedsMaxDeposit
                );
                found = true;
                break;
            }
        }
        require!(found, ErrorCode::NotWhitelisted);

        let cpi_accounts = TransferChecked {
            from: self.user_ata.to_account_info(),
            to: self.vault.to_account_info(),
            mint: self.mint.to_account_info(),
            authority: self.user.to_account_info(),
        };
        let cpi_ctx = CpiContext::new(self.token_program.key(), cpi_accounts);
        token_interface::transfer_checked(cpi_ctx, amount, self.mint.decimals)
    }
}
