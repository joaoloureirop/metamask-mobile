// Third party dependencies.
import React, {
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useSelector } from 'react-redux';
import { isEqual } from 'lodash';
import { useNavigation } from '@react-navigation/native';

// External dependencies.
import BottomSheet, {
  BottomSheetRef,
} from '../../../component-library/components/BottomSheets/BottomSheet';
import Engine from '../../../core/Engine';
import {
  addPermittedAccounts,
  getPermittedAccountsByHostname,
} from '../../../core/Permissions';
import AccountConnectMultiSelector from '../AccountConnect/AccountConnectMultiSelector';
import NetworkConnectMultiSelector from '../NetworkConnect/NetworkConnectMultiSelector';
import Logger from '../../../util/Logger';
import {
  ToastContext,
  ToastVariants,
} from '../../../component-library/components/Toast';
import { ToastOptions } from '../../../component-library/components/Toast/Toast.types';
import { MetaMetricsEvents } from '../../../core/Analytics';
import { useAccounts, Account } from '../../hooks/useAccounts';
import getAccountNameWithENS from '../../../util/accounts';
import { IconName } from '../../../component-library/components/Icons/Icon';
import { getUrlObj, prefixUrlWithProtocol } from '../../../util/browser';
import { getActiveTabUrl } from '../../../util/transactions';
import { strings } from '../../../../locales/i18n';
import { AvatarAccountType } from '../../../component-library/components/Avatars/Avatar/variants/AvatarAccount';
import { selectAccountsLength } from '../../../selectors/accountTrackerController';
import { selectNetworkConfigurations } from '../../../selectors/networkController';

// Internal dependencies.
import {
  AccountPermissionsProps,
  AccountPermissionsScreens,
} from './AccountPermissions.types';
import AccountPermissionsConnected from './AccountPermissionsConnected';
import AccountPermissionsRevoke from './AccountPermissionsRevoke';
import { USER_INTENT } from '../../../constants/permissions';
import useFavicon from '../../hooks/useFavicon/useFavicon';
import URLParse from 'url-parse';
import { useMetrics } from '../../../components/hooks/useMetrics';
import { selectInternalAccounts } from '../../../selectors/accountsController';
import { selectPermissionControllerState } from '../../../selectors/snaps/permissionController';
import { RootState } from '../../../reducers';
import { isMutichainVersion1Enabled } from '../../../util/networks';
import PermissionsSummary from '../../../components/UI/PermissionsSummary';
import { PermissionsSummaryProps } from '../../../components/UI/PermissionsSummary/PermissionsSummary.types';

const AccountPermissions = (props: AccountPermissionsProps) => {
  const navigation = useNavigation();
  const { trackEvent } = useMetrics();
  const {
    hostInfo: {
      metadata: { origin: hostname },
    },
    isRenderedAsBottomSheet = true,
    initialScreen = AccountPermissionsScreens.Connected,
  } = props.route.params;

  const accountAvatarType = useSelector((state: RootState) =>
    state.settings.useBlockieIcon
      ? AvatarAccountType.Blockies
      : AvatarAccountType.JazzIcon,
  );

  const accountsLength = useSelector(selectAccountsLength);

  const nonTestnetNetworks = useSelector(
    (state: RootState) =>
      Object.keys(selectNetworkConfigurations(state)).length + 1,
  );

  const origin: string = useSelector(getActiveTabUrl, isEqual);
  const faviconSource = useFavicon(origin);
  // TODO - Once we can pass metadata to permission system, pass origin instead of hostname into this component.
  // const hostname = useMemo(() => new URL(origin).hostname, [origin]);
  const secureIcon = useMemo(
    () =>
      (getUrlObj(origin) as URLParse<string>).protocol === 'https:'
        ? IconName.Lock
        : IconName.LockSlash,
    [origin],
  );

  const urlWithProtocol = prefixUrlWithProtocol(hostname);

  const { toastRef } = useContext(ToastContext);
  const [isLoading, setIsLoading] = useState(false);
  const permittedAccountsList = useSelector(selectPermissionControllerState);
  const permittedAccountsByHostname = getPermittedAccountsByHostname(
    permittedAccountsList,
    hostname,
  );
  const [selectedAddresses, setSelectedAddresses] = useState<string[]>([]);
  const sheetRef = useRef<BottomSheetRef>(null);
  const [permissionsScreen, setPermissionsScreen] =
    useState<AccountPermissionsScreens>(initialScreen);
  const { accounts, ensByAccountAddress } = useAccounts({
    isLoading,
  });
  const previousPermittedAccounts = useRef<string[]>();
  const previousIdentitiesListSize = useRef<number>();
  const internalAccounts = useSelector(selectInternalAccounts);
  const activeAddress: string = permittedAccountsByHostname[0];

  const [userIntent, setUserIntent] = useState(USER_INTENT.None);

  const hideSheet = useCallback(
    (callback?: () => void) =>
      sheetRef?.current?.onCloseBottomSheet?.(callback),
    [sheetRef],
  );
  const metricsSource = 'Browser Tab/Permission UI';

  // Checks if anymore accounts are connected to the dapp. Auto dismiss sheet if none are connected.
  useEffect(() => {
    if (
      previousPermittedAccounts.current === undefined &&
      permittedAccountsByHostname.length === 0 &&
      isRenderedAsBottomSheet
    ) {
      // TODO - Figure out better UX instead of auto dismissing. However, we cannot be in this state as long as accounts are not connected.
      hideSheet();

      const plainToastProps: ToastOptions = {
        variant: ToastVariants.Plain,
        labelOptions: [{ label: strings('toast.disconnected_all') }],
        hasNoTimeout: false,
      };

      const networkToastProps: ToastOptions = {
        variant: ToastVariants.Network,
        labelOptions: [
          {
            label: strings('toast.disconnected_from', {
              dappHostName: hostname,
            }),
          },
        ],
        hasNoTimeout: false,
        networkImageSource: faviconSource,
      };

      toastRef?.current?.showToast(
        isMutichainVersion1Enabled ? networkToastProps : plainToastProps,
      );

      previousPermittedAccounts.current = permittedAccountsByHostname.length;
    }
  }, [
    permittedAccountsByHostname,
    hideSheet,
    toastRef,
    hostname,
    faviconSource,
    isRenderedAsBottomSheet,
  ]);

  // Refreshes selected addresses based on the addition and removal of accounts.
  useEffect(() => {
    // Extract the address list from the internalAccounts array
    const accountsAddressList = internalAccounts.map((account) =>
      account.address.toLowerCase(),
    );

    if (previousIdentitiesListSize.current !== accountsAddressList.length) {
      // Clean up selected addresses that are no longer part of accounts.
      const updatedSelectedAddresses = selectedAddresses.filter((address) =>
        accountsAddressList.includes(address.toLowerCase()),
      );
      setSelectedAddresses(updatedSelectedAddresses);
      previousIdentitiesListSize.current = accountsAddressList.length;
    }
  }, [internalAccounts, selectedAddresses]);

  const accountsFilteredByPermissions = useMemo(() => {
    const accountsByPermittedStatus: Record<
      'permitted' | 'unpermitted',
      Account[]
    > = {
      permitted: [],
      unpermitted: [],
    };

    accounts.forEach((account) => {
      const lowercasedAccount = account.address.toLowerCase();
      if (permittedAccountsByHostname.includes(lowercasedAccount)) {
        accountsByPermittedStatus.permitted.push(account);
      } else {
        accountsByPermittedStatus.unpermitted.push(account);
      }
    });

    return accountsByPermittedStatus;
  }, [accounts, permittedAccountsByHostname]);

  const handleCreateAccount = useCallback(
    async () => {
      const { KeyringController } = Engine.context;
      try {
        setIsLoading(true);
        await KeyringController.addNewAccount();
        trackEvent(MetaMetricsEvents.ACCOUNTS_ADDED_NEW_ACCOUNT);
        trackEvent(MetaMetricsEvents.SWITCHED_ACCOUNT, {
          source: metricsSource,
          number_of_accounts: accounts?.length,
        });
      } catch (e) {
        Logger.error(e as Error, 'Error while trying to add a new account.');
      } finally {
        setIsLoading(false);
      }
    },
    /* eslint-disable-next-line */
    [setIsLoading],
  );

  const handleConnect = useCallback(() => {
    try {
      setIsLoading(true);
      const newActiveAddress = addPermittedAccounts(
        hostname,
        selectedAddresses,
      );
      const activeAccountName = getAccountNameWithENS({
        accountAddress: newActiveAddress,
        accounts,
        ensByAccountAddress,
      });
      const connectedAccountLength = selectedAddresses.length;
      let labelOptions: ToastOptions['labelOptions'] = [];
      if (connectedAccountLength > 1) {
        labelOptions = [
          { label: `${connectedAccountLength} `, isBold: true },
          {
            label: `${strings('toast.accounts_connected')}\n`,
          },
          { label: `${activeAccountName} `, isBold: true },
          { label: strings('toast.now_active') },
        ];
      } else {
        labelOptions = [
          { label: `${activeAccountName} `, isBold: true },
          { label: strings('toast.connected_and_active') },
        ];
      }
      toastRef?.current?.showToast({
        variant: ToastVariants.Account,
        labelOptions,
        accountAddress: newActiveAddress,
        accountAvatarType,
        hasNoTimeout: false,
      });
      const totalAccounts = accountsLength;
      // TODO: confirm this value is the newly added accounts or total connected accounts
      const connectedAccounts = connectedAccountLength;
      trackEvent(MetaMetricsEvents.ADD_ACCOUNT_DAPP_PERMISSIONS, {
        number_of_accounts: totalAccounts,
        number_of_accounts_connected: connectedAccounts,
        number_of_networks: nonTestnetNetworks,
      });
    } catch (e) {
      Logger.error(e as Error, 'Error while trying to connect to a dApp.');
    } finally {
      setIsLoading(false);
    }
  }, [
    selectedAddresses,
    accounts,
    setIsLoading,
    hostname,
    ensByAccountAddress,
    toastRef,
    accountAvatarType,
    accountsLength,
    nonTestnetNetworks,
    trackEvent,
  ]);

  useEffect(() => {
    if (userIntent === USER_INTENT.None) return;

    const handleUserActions = (action: USER_INTENT) => {
      switch (action) {
        case USER_INTENT.Confirm: {
          handleConnect();
          hideSheet(() => {
            trackEvent(MetaMetricsEvents.SWITCHED_ACCOUNT, {
              source: metricsSource,
              number_of_accounts: accounts?.length,
            });
          });
          break;
        }
        case USER_INTENT.Create:
        case USER_INTENT.CreateMultiple: {
          handleCreateAccount();
          break;
        }
        case USER_INTENT.Cancel: {
          hideSheet();
          break;
        }
        case USER_INTENT.Import: {
          navigation.navigate('ImportPrivateKeyView');
          // Is this where we want to track importing an account or within ImportPrivateKeyView screen?
          trackEvent(MetaMetricsEvents.ACCOUNTS_IMPORTED_NEW_ACCOUNT);

          break;
        }
        case USER_INTENT.ConnectHW: {
          navigation.navigate('ConnectQRHardwareFlow');
          // Is this where we want to track connecting a hardware wallet or within ConnectQRHardwareFlow screen?
          trackEvent(MetaMetricsEvents.CONNECT_HARDWARE_WALLET);

          break;
        }
      }
    };

    handleUserActions(userIntent);

    setUserIntent(USER_INTENT.None);
  }, [
    navigation,
    userIntent,
    sheetRef,
    hideSheet,
    handleCreateAccount,
    handleConnect,
    accounts?.length,
    trackEvent,
  ]);

  const renderConnectedScreen = useCallback(
    () => (
      <AccountPermissionsConnected
        isLoading={isLoading}
        onSetSelectedAddresses={setSelectedAddresses}
        onSetPermissionsScreen={setPermissionsScreen}
        onDismissSheet={hideSheet}
        accounts={accountsFilteredByPermissions.permitted}
        ensByAccountAddress={ensByAccountAddress}
        selectedAddresses={[activeAddress]}
        favicon={faviconSource}
        hostname={hostname}
        urlWithProtocol={urlWithProtocol}
        secureIcon={secureIcon}
        accountAvatarType={accountAvatarType}
      />
    ),
    [
      ensByAccountAddress,
      activeAddress,
      isLoading,
      accountsFilteredByPermissions,
      setSelectedAddresses,
      setPermissionsScreen,
      hideSheet,
      faviconSource,
      hostname,
      urlWithProtocol,
      secureIcon,
      accountAvatarType,
    ],
  );

  const renderPermissionsSummaryScreen = useCallback(() => {
    const permissionsSummaryProps: PermissionsSummaryProps = {
      currentPageInformation: {
        currentEnsName: '',
        icon: faviconSource as string,
        url: urlWithProtocol,
      },
      onEdit: () =>
        setPermissionsScreen(AccountPermissionsScreens.EditAccountsPermissions),
      onEditNetworks: () =>
        setPermissionsScreen(AccountPermissionsScreens.ConnectMoreNetworks),
      onUserAction: setUserIntent,
      showActionButtons: false,
      onBack: () =>
        isRenderedAsBottomSheet
          ? setPermissionsScreen(AccountPermissionsScreens.Connected)
          : navigation.navigate('PermissionsManager'),
      isInitialDappConnection: false,
    };
    return <PermissionsSummary {...permissionsSummaryProps} />;
  }, [faviconSource, urlWithProtocol, isRenderedAsBottomSheet, navigation]);

  const renderEditAccountsPermissionsScreen = useCallback(
    () => (
      <AccountConnectMultiSelector
        accounts={accountsFilteredByPermissions.unpermitted}
        ensByAccountAddress={ensByAccountAddress}
        selectedAddresses={selectedAddresses}
        onSelectAddress={setSelectedAddresses}
        isLoading={isLoading}
        onUserAction={setUserIntent}
        favicon={faviconSource}
        urlWithProtocol={urlWithProtocol}
        hostname={hostname}
        secureIcon={secureIcon}
        isAutoScrollEnabled={false}
        onBack={() =>
          setPermissionsScreen(AccountPermissionsScreens.PermissionsSummary)
        }
        screenTitle={strings('accounts.edit_accounts_title')}
      />
    ),
    [
      ensByAccountAddress,
      selectedAddresses,
      isLoading,
      accountsFilteredByPermissions,
      setUserIntent,
      faviconSource,
      urlWithProtocol,
      secureIcon,
      hostname,
    ],
  );

  const renderConnectMoreAccountsScreen = useCallback(
    () => (
      <AccountConnectMultiSelector
        accounts={accountsFilteredByPermissions.unpermitted}
        ensByAccountAddress={ensByAccountAddress}
        selectedAddresses={selectedAddresses}
        onSelectAddress={setSelectedAddresses}
        isLoading={isLoading}
        onUserAction={setUserIntent}
        favicon={faviconSource}
        urlWithProtocol={urlWithProtocol}
        hostname={hostname}
        secureIcon={secureIcon}
        isAutoScrollEnabled={false}
        onBack={() => setPermissionsScreen(AccountPermissionsScreens.Connected)}
        screenTitle={strings('accounts.connect_more_accounts')}
      />
    ),
    [
      ensByAccountAddress,
      selectedAddresses,
      isLoading,
      accountsFilteredByPermissions,
      setUserIntent,
      faviconSource,
      urlWithProtocol,
      secureIcon,
      hostname,
    ],
  );

  const renderConnectNetworksScreen = useCallback(
    () => (
      <NetworkConnectMultiSelector
        onSelectNetworkIds={setSelectedAddresses}
        isLoading={isLoading}
        onUserAction={setUserIntent}
        urlWithProtocol={urlWithProtocol}
        hostname={hostname}
        onBack={() =>
          setPermissionsScreen(AccountPermissionsScreens.PermissionsSummary)
        }
      />
    ),
    [isLoading, setUserIntent, urlWithProtocol, hostname],
  );

  const renderRevokeScreen = useCallback(
    () => (
      <AccountPermissionsRevoke
        accounts={accountsFilteredByPermissions.permitted}
        onSetPermissionsScreen={setPermissionsScreen}
        ensByAccountAddress={ensByAccountAddress}
        permittedAddresses={permittedAccountsByHostname}
        isLoading={isLoading}
        favicon={faviconSource}
        urlWithProtocol={urlWithProtocol}
        hostname={hostname}
        secureIcon={secureIcon}
        accountAvatarType={accountAvatarType}
      />
    ),
    [
      ensByAccountAddress,
      isLoading,
      permittedAccountsByHostname,
      accountsFilteredByPermissions,
      setPermissionsScreen,
      faviconSource,
      hostname,
      urlWithProtocol,
      secureIcon,
      accountAvatarType,
    ],
  );
  const renderPermissionsScreens = useCallback(() => {
    switch (permissionsScreen) {
      case AccountPermissionsScreens.Connected:
        return renderConnectedScreen();
      case AccountPermissionsScreens.ConnectMoreAccounts:
        return renderConnectMoreAccountsScreen();
      case AccountPermissionsScreens.EditAccountsPermissions:
        return renderEditAccountsPermissionsScreen();
      case AccountPermissionsScreens.ConnectMoreNetworks:
        return renderConnectNetworksScreen();
      case AccountPermissionsScreens.Revoke:
        return renderRevokeScreen();
      case AccountPermissionsScreens.PermissionsSummary:
        return renderPermissionsSummaryScreen();
    }
  }, [
    permissionsScreen,
    renderConnectedScreen,
    renderConnectMoreAccountsScreen,
    renderEditAccountsPermissionsScreen,
    renderConnectNetworksScreen,
    renderRevokeScreen,
    renderPermissionsSummaryScreen,
  ]);

  return isRenderedAsBottomSheet ? (
    <BottomSheet ref={sheetRef}>{renderPermissionsScreens()}</BottomSheet>
  ) : (
    renderPermissionsScreens()
  );
};

export default AccountPermissions;
