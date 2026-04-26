package com.orderbook.app;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.os.Handler;
import android.os.Looper;
import android.util.Log;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

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
                Log.d(TAG, "Starting widget update...");

                // Fetch current price
                String priceJson = fetchUrl("https://data-api.binance.vision/api/v3/ticker/price?symbol=BTCUSDT");
                JSONObject priceObj = new JSONObject(priceJson);
                double currentPrice = Double.parseDouble(priceObj.getString("price"));
                Log.d(TAG, "Current price: " + currentPrice);

                // Fetch depth
                String depthJson = fetchUrl("https://data-api.binance.vision/api/v3/depth?symbol=BTCUSDT&limit=5000");
                JSONObject depthObj = new JSONObject(depthJson);

                // Parse asks and bids using JSONArray
                JSONArray asksArr = depthObj.getJSONArray("asks");
                JSONArray bidsArr = depthObj.getJSONArray("bids");

                List<double[]> asks = new ArrayList<>();
                for (int i = 0; i < asksArr.length(); i++) {
                    JSONArray level = asksArr.getJSONArray(i);
                    double price = Double.parseDouble(level.getString(0));
                    double qty = Double.parseDouble(level.getString(1));
                    asks.add(new double[]{price, qty});
                }

                List<double[]> bids = new ArrayList<>();
                for (int i = 0; i < bidsArr.length(); i++) {
                    JSONArray level = bidsArr.getJSONArray(i);
                    double price = Double.parseDouble(level.getString(0));
                    double qty = Double.parseDouble(level.getString(1));
                    bids.add(new double[]{price, qty});
                }

                Log.d(TAG, "Parsed asks: " + asks.size() + ", bids: " + bids.size());

                // Calculate step (0.01% of mid price)
                double step = currentPrice * 0.0001;
                double magnitude = Math.pow(10, Math.floor(Math.log10(step)));
                step = Math.max(magnitude, 1e-15);

                // Aggregate and get top 16
                List<double[]> shortLevels = aggregate(asks, step, 16);
                List<double[]> longLevels = aggregate(bids, step, 16);

                // Calculate averages
                double avgShort = average(shortLevels);
                double avgLong = average(longLevels);

                // Entry point
                double f3 = (avgShort + avgLong) / 2.0;
                int si = Math.min(7, shortLevels.size() - 1);
                int li = Math.min(7, longLevels.size() - 1);
                double shortMid = si >= 0 ? shortLevels.get(si)[0] : avgShort;
                double longMid = li >= 0 ? longLevels.get(li)[0] : avgLong;
                double entryPoint = (f3 + shortMid + longMid) / 3.0;

                Log.d(TAG, "AvgShort=" + avgShort + " AvgLong=" + avgLong + " Entry=" + entryPoint);

                // Format numbers
                NumberFormat nf = NumberFormat.getInstance(Locale.US);
                nf.setMaximumFractionDigits(0);
                nf.setGroupingUsed(true);

                NumberFormat nf2 = NumberFormat.getInstance(Locale.US);
                nf2.setMaximumFractionDigits(2);
                nf2.setGroupingUsed(true);

                String timeStr = new SimpleDateFormat("HH:mm", Locale.getDefault()).format(new Date());

                String priceStr = "$" + nf.format(currentPrice);
                String shortStr = "$" + nf.format(avgShort);
                String longStr = "$" + nf.format(avgLong);
                String entryStr = "$" + nf2.format(entryPoint);

                mainHandler.post(() -> {
                    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_order_book);
                    views.setTextViewText(R.id.widget_symbol, "BTC / USDT");
                    views.setTextViewText(R.id.widget_price, priceStr);
                    views.setTextViewText(R.id.widget_short, shortStr);
                    views.setTextViewText(R.id.widget_long, longStr);
                    views.setTextViewText(R.id.widget_entry, entryStr);
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
                    Log.d(TAG, "Widget updated successfully");
                });
            } catch (Exception e) {
                Log.e(TAG, "Widget update failed: " + e.getMessage(), e);
                mainHandler.post(() -> {
                    RemoteViews views = new RemoteViews(context.getPackageName(), R.layout.widget_order_book);
                    views.setTextViewText(R.id.widget_price, "Sin conexión");
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
        conn.setConnectTimeout(15000);
        conn.setReadTimeout(15000);
        conn.setRequestProperty("User-Agent", "Mozilla/5.0");
        conn.setRequestProperty("Accept", "application/json");
        try {
            int code = conn.getResponseCode();
            Log.d(TAG, "HTTP " + code + " for " + urlStr);
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
