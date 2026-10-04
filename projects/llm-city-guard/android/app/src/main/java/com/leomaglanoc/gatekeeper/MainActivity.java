package com.leomaglanoc.gatekeeper;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(android.os.Bundle savedInstanceState) {
        registerPlugin(NativeLlmPlugin.class);
        super.onCreate(savedInstanceState);
    }

    @Override
    public void onNewIntent(android.content.Intent intent) {
        setIntent(intent);
        super.onNewIntent(intent);
    }
}
