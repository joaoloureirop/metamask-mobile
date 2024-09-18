import { useState } from 'react';
import { View, Text, Pressable, StyleSheet, TextInput } from 'react-native';
import { InAppBrowser } from 'react-native-inappbrowser-reborn';

const InAppBrowserView = () => {

  const [browserPlaceholderText, setBrowserPlaceholderText] = useState('Checking browser availability');
  const [shouldOpenBrowser, setShouldOpenBrowser] = useState(false);
  const [url, setUrl] = useState('https://home.metamask.io/');

    InAppBrowser.isAvailable().then(() => {
      setBrowserPlaceholderText('Browser available')
      setShouldOpenBrowser(true);
    },
      () => setBrowserPlaceholderText('Browser not Available')
    );

  const opts = {
    // iOS Properties
    dismissButtonStyle: 'cancel',
    preferredBarTintColor: '#453AA4',
    preferredControlTintColor: 'white',
    readerMode: false,
    animated: true,
    modalPresentationStyle: 'fullScreen',
    modalTransitionStyle: 'coverVertical',
    modalEnabled: true,
    enableBarCollapsing: false,
    // Android Properties
    showTitle: true,
    toolbarColor: '#6200EE',
    secondaryToolbarColor: 'black',
    navigationBarColor: 'black',
    navigationBarDividerColor: 'white',
    enableUrlBarHiding: true,
    enableDefaultShare: true,
    forceCloseOnRedirection: false,
    // Specify full animation resource identifier(package:anim/name)
    // or only resource name(in case of animation bundled with app).
    animations: {
      startEnter: 'slide_in_right',
      startExit: 'slide_out_left',
      endEnter: 'slide_in_left',
      endExit: 'slide_out_right'
    },
    headers: {
      'my-custom-header': 'my custom header value'
    }
  };

  const handleOpenBrowserButtonPress = () => InAppBrowser.open(url, opts);

  const handleUrlChange = setUrl;

  return (<View>
    <Text>{browserPlaceholderText}</Text>
    <TextInput
      style={styles.input}
      onChangeText={handleUrlChange}
      value={url}
    />
    <Pressable onPress={handleOpenBrowserButtonPress} disabled={!shouldOpenBrowser} >
      <Text>Open Browser</Text>
    </Pressable>
  </View>);
}

const styles = StyleSheet.create({
  input: {
    height: 40,
    margin: 12,
    borderWidth: 1,
    padding: 10,
  },
});

export default InAppBrowserView;

