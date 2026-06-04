use anchor_lang::prelude::*;
use anchor_lang::solana_program::program_error::ProgramError;
use spl_tlv_account_resolution::account::ExtraAccountMeta;
use solana_program_pack::Pack;

use crate::error::ErrorCode;
use crate::VaultConfig;

pub const TRANSFER_HOOK_EXECUTE_DISCRIMINATOR: [u8; 8] =
    [98, 167, 215, 100, 216, 148, 103, 167];

pub fn process_transfer_hook_execute<'a>(
    _program_id: &Pubkey,
    accounts: &'a [AccountInfo<'a>],
    _data: &[u8],
) -> Result<()> {
    let source_info = &accounts[0];
    let destination_info = &accounts[1];
    let _mint_info = &accounts[2];
    let authority_info = &accounts[3];

    let vault_config_info = accounts.get(4)
        .ok_or(ErrorCode::InvalidExtraAccount)?;

    let vault_config = Account::<VaultConfig>::try_from(vault_config_info)
        .map_err(|_| ProgramError::InvalidAccountData)?;

    let src_data = source_info.data.borrow();
    let src_raw = spl_token_2022::state::Account::unpack(&src_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;

    let dst_data = destination_info.data.borrow();
    let dst_raw = spl_token_2022::state::Account::unpack(&dst_data)
        .map_err(|_| ProgramError::InvalidAccountData)?;

    let source_owner = Pubkey::from(src_raw.owner.to_bytes());
    let dest_owner = Pubkey::from(dst_raw.owner.to_bytes());

    if authority_info.key() == vault_config.key() {
        return Ok(());
    }

    if is_whitelisted(&vault_config, source_owner)
        || is_whitelisted(&vault_config, dest_owner)
    {
        return Ok(());
    }

    if source_owner == vault_config.key() || dest_owner == vault_config.key() {
        return Err(ErrorCode::NotWhitelisted.into());
    }

    Err(ErrorCode::TransferHookSourceNotWhitelisted.into())
}

pub fn is_whitelisted(config: &VaultConfig, user: Pubkey) -> bool {
    let count = config.whitelist_count as usize;
    for i in 0..count {
        if config.whitelist[i].user == user {
            return true;
        }
    }
    false
}

pub fn create_extra_account_metas(vault_config_key: &Pubkey) -> Result<Vec<ExtraAccountMeta>> {
    let spl_pk = spl_tlv_account_resolution::solana_pubkey::Pubkey::from(
        vault_config_key.to_bytes(),
    );
    let meta = ExtraAccountMeta::new_with_pubkey(
        &spl_pk,
        false,
        false,
    ).map_err(|_| ProgramError::InvalidArgument)?;
    Ok(vec![meta])
}
