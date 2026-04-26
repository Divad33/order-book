package com.orderbook.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Handler;
import android.os.Looper;
import android.widget.RemoteViews;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.NumberFormat;
import java.util.Locale;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class OrderBookWidget extends AppWidgetProvider {

    private static final String ACTION_REFRESH = "com.orderbook.app.WIDGET_REFRESH";
    private final ExecutorService executor = Executors.newSingleThreadExecutor();
    private final Handler mainHandler = new Handler(Looper.getMainLooper());

    @Override
    public void onUpdate(Context context, AppWidgetManager appWidgetManager, int[] appWidgetIds) {
        for (int appWidgetId : appWidgetIds) {
            updateWidget(context, appWidgetManager, appWidgetId);
        }
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        super.onReceive(context, intent);
        if (ACTION_REFRESH.equals(intent.getAction())) {
            AppWidgetManager mgr = AppWidgetManager.getInstance(context);
            int[] ids = mgr.getAppWidgetIds(new ComponentName(context, OrderBookWidget.class));
            onUpdate(context, mgr, ids);
        }
    }

    private void updateWidget(Context context, AppWidgetManager mgr, int widgetId) {
        executor.execute(() -> {
            try {
                String priceJson = fetchUrl("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT");
                double price = extractDouble(priceJson, "price");

                String depthJson = fetchUrl("https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=100");
                double topAsk = extractFirstPrice(depthJson, "asks");
                double topBid = extractFirstPrice(depthJson, "bids");

                NumberFormat nf = NumberFormat.getInstance(Locale.US);
                nf.setMaximumFractionDigits(0);

                mainHandler.post(() -> {
                    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_order_book);
                    views.setTextViewText(R.id.widget_symbol, "BTC / USDT");
                    views.setTextViewText(R.id.widget_price, "$" + nf.format(price));
                    views.setTextViewText(R.id.widget_short, "S: $" + nf.format(topAsk));
                    views.setTextViewText(R.id.widget_long, "L: $" + nf.format(topBid));

                    Intent openApp = new Intent(context, MainActivity.class);
                    PendingIntent pi = PendingIntent.getActivity(context, 0, openApp, PendingIntent.FLAG_IMMUTABLE);
                    views.setOnClickPendingIntent(R.id.widget_root, pi);

                    Intent refresh = new Intent(context, OrderBookWidget.class);
                    refresh.setAction(ACTION_REFRESH);
                    PendingIntent refreshPi = PendingIntent.getBroadcast(context, 0, refresh, PendingIntent.FLAG_IMMUTABLE);
                    views.setOnClickPendingIntent(R.id.widget_price, refreshPi);

                    mgr.updateAppWidget(widgetId, views);
                });
            } catch (Exception e) {
                e.printStackTrace();
            }
        });
    }

    private String fetchUrl(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(5000);
        BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
        StringBuilder sb = new StringBuilder();
        String line;
        while ((line = reader.readLine()) != null) sb.append(line);
        reader.close();
        return sb.toString();
    }

    private double extractDouble(String json, String key) {
        int idx = json.indexOf("\"" + key + "\"");
        if (idx < 0) return 0;
        int start = json.indexOf("\"", idx + key.length() + 2) + 1;
        int end = json.indexOf("\"", start);
        return Double.parseDouble(json.substring(start, end));
    }

    private double extractFirstPrice(String json, String key) {
        int idx = json.indexOf("\"" + key + "\"");
        if (idx < 0) return 0;
        int bracket = json.indexOf("[[", idx);
        if (bracket < 0) return 0;
        int start = json.indexOf("\"", bracket + 2) + 1;
        int end = json.indexOf("\"", start);
        return Double.parseDouble(json.substring(start, end));
    }
}
