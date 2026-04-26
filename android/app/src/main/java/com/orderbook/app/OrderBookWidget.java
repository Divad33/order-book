package com.orderbook.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.NumberFormat;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Collections;
import java.util.Date;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import android.os.Handler;
import android.os.Looper;
import android.util.Log;

public class OrderBookWidget extends AppWidgetProvider {

    private static final String TAG = "OrderBookWidget";
    private static final String ACTION_REFRESH = "com.orderbook.app.WIDGET_REFRESH";

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
        ExecutorService executor = Executors.newSingleThreadExecutor();
        Handler mainHandler = new Handler(Looper.getMainLooper());

        executor.execute(() -> {
            try {
                // Fetch current price
                String priceJson = fetchUrl("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT");
                double currentPrice = extractPrice(priceJson);

                // Fetch depth for order book
                String depthJson = fetchUrl("https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=5000");

                // Parse asks (shorts) and bids (longs)
                List<double[]> asks = parseLevels(depthJson, "asks");
                List<double[]> bids = parseLevels(depthJson, "bids");

                // Calculate step
                double askStep = calcStep(asks);
                double bidStep = calcStep(bids);

                // Aggregate and get top 16
                List<double[]> shortLevels = aggregate(asks, askStep, 16);
                List<double[]> longLevels = aggregate(bids, bidStep, 16);

                // Calculate averages
                double avgShort = average(shortLevels);
                double avgLong = average(longLevels);

                // Entry point (same formula as app)
                double f3 = (avgShort + avgLong) / 2.0;
                int si = Math.min(7, shortLevels.size() - 1);
                int li = Math.min(7, longLevels.size() - 1);
                double shortMid = si >= 0 ? shortLevels.get(si)[0] : avgShort;
                double longMid = li >= 0 ? longLevels.get(li)[0] : avgLong;
                double entryPoint = (f3 + shortMid + longMid) / 3.0;

                // Format
                NumberFormat nf = NumberFormat.getInstance(Locale.US);
                nf.setMaximumFractionDigits(0);
                nf.setGroupingUsed(true);

                NumberFormat nf2 = NumberFormat.getInstance(Locale.US);
                nf2.setMaximumFractionDigits(2);
                nf2.setGroupingUsed(true);

                String timeStr = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());

                mainHandler.post(() -> {
                    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_order_book);
                    views.setTextViewText(R.id.widget_symbol, "BTC / USDT");
                    views.setTextViewText(R.id.widget_price, "$" + nf.format(currentPrice));
                    views.setTextViewText(R.id.widget_short, "$" + nf.format(avgShort));
                    views.setTextViewText(R.id.widget_long, "$" + nf.format(avgLong));
                    views.setTextViewText(R.id.widget_entry, "$" + nf2.format(entryPoint));
                    views.setTextViewText(R.id.widget_time, timeStr);

                    // Click to open app
                    Intent openApp = new Intent(context, MainActivity.class);
                    PendingIntent pi = PendingIntent.getActivity(context, 0, openApp,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    views.setOnClickPendingIntent(R.id.widget_root, pi);

                    // Click price to refresh
                    Intent refresh = new Intent(context, OrderBookWidget.class);
                    refresh.setAction(ACTION_REFRESH);
                    PendingIntent refreshPi = PendingIntent.getBroadcast(context, 1, refresh,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    views.setOnClickPendingIntent(R.id.widget_price, refreshPi);

                    mgr.updateAppWidget(widgetId, views);
                });
            } catch (Exception e) {
                Log.e(TAG, "Widget update failed", e);
                mainHandler.post(() -> {
                    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_order_book);
                    views.setTextViewText(R.id.widget_price, "Error");
                    views.setTextViewText(R.id.widget_time, "Toca para reintentar");

                    Intent refresh = new Intent(context, OrderBookWidget.class);
                    refresh.setAction(ACTION_REFRESH);
                    PendingIntent refreshPi = PendingIntent.getBroadcast(context, 1, refresh,
                            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
                    views.setOnClickPendingIntent(R.id.widget_root, refreshPi);

                    mgr.updateAppWidget(widgetId, views);
                });
            } finally {
                executor.shutdown();
            }
        });
    }

    private String fetchUrl(String urlStr) throws Exception {
        URL url = new URL(urlStr);
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(10000);
        conn.setReadTimeout(10000);
        conn.setRequestProperty("User-Agent", "OrderBook-Widget/1.0");
        try {
            int code = conn.getResponseCode();
            if (code != 200) throw new Exception("HTTP " + code);
            BufferedReader reader = new BufferedReader(new InputStreamReader(conn.getInputStream()));
            StringBuilder sb = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) sb.append(line);
            reader.close();
            return sb.toString();
        } finally {
            conn.disconnect();
        }
    }

    private double extractPrice(String json) {
        int idx = json.indexOf("\"price\"");
        if (idx < 0) return 0;
        int start = json.indexOf("\"", idx + 7) + 1;
        int end = json.indexOf("\"", start);
        return Double.parseDouble(json.substring(start, end));
    }

    private List<double[]> parseLevels(String json, String key) {
        List<double[]> levels = new ArrayList<>();
        int idx = json.indexOf("\"" + key + "\"");
        if (idx < 0) return levels;

        int arrStart = json.indexOf("[[", idx);
        if (arrStart < 0) return levels;

        int pos = arrStart;
        while (true) {
            int open = json.indexOf("[\"", pos);
            if (open < 0) break;
            int priceStart = open + 2;
            int priceEnd = json.indexOf("\"", priceStart);
            if (priceEnd < 0) break;

            int qtyStart = json.indexOf("\"", priceEnd + 1) + 1;
            int qtyEnd = json.indexOf("\"", qtyStart);
            if (qtyEnd < 0) break;

            double price = Double.parseDouble(json.substring(priceStart, priceEnd));
            double qty = Double.parseDouble(json.substring(qtyStart, qtyEnd));
            levels.add(new double[]{price, qty});

            pos = qtyEnd + 1;
            // Stop if we hit the end of this array (next key or end)
            int nextBracket = json.indexOf("]]", pos);
            if (nextBracket >= 0 && nextBracket < pos + 5) break;
        }
        return levels;
    }

    private double calcStep(List<double[]> levels) {
        if (levels.size() < 2) return 1;
        double first = levels.get(0)[0];
        double last = levels.get(levels.size() - 1)[0];
        double mid = (first + last) / 2.0;
        if (mid <= 0) return 1;
        double raw = mid * 0.0001;
        double mag = Math.pow(10, Math.floor(Math.log10(raw)));
        return Math.max(mag, 1e-15);
    }

    private List<double[]> aggregate(List<double[]> levels, double step, int count) {
        Map<Long, Double> buckets = new HashMap<>();
        for (double[] lv : levels) {
            long key = Math.round(lv[0] / step);
            double prev = buckets.containsKey(key) ? buckets.get(key) : 0;
            buckets.put(key, prev + lv[1]);
        }

        List<double[]> sorted = new ArrayList<>();
        for (Map.Entry<Long, Double> e : buckets.entrySet()) {
            sorted.add(new double[]{e.getKey() * step, e.getValue()});
        }
        Collections.sort(sorted, (a, b) -> Double.compare(b[1], a[1]));

        List<double[]> top = new ArrayList<>();
        for (int i = 0; i < Math.min(count, sorted.size()); i++) {
            top.add(sorted.get(i));
        }
        Collections.sort(top, (a, b) -> Double.compare(b[0], a[0]));
        return top;
    }

    private double average(List<double[]> levels) {
        if (levels.isEmpty()) return 0;
        double sum = 0;
        for (double[] lv : levels) sum += lv[0];
        return sum / levels.size();
    }
}
