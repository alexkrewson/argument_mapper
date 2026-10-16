package com.alexkrewson.argumentmapper;

import com.android.billingclient.api.AccountIdentifiers;
import com.android.billingclient.api.BillingClient;
import com.android.billingclient.api.BillingClientStateListener;
import com.android.billingclient.api.BillingFlowParams;
import com.android.billingclient.api.BillingResult;
import com.android.billingclient.api.PendingPurchasesParams;
import com.android.billingclient.api.ProductDetails;
import com.android.billingclient.api.Purchase;
import com.android.billingclient.api.PurchasesUpdatedListener;
import com.android.billingclient.api.QueryProductDetailsParams;
import com.android.billingclient.api.QueryPurchasesParams;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import org.json.JSONException;

import java.util.ArrayList;
import java.util.Collections;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * Google Play Billing for credit top-ups, and nothing else.
 *
 * Deliberately thin: it lists products, launches Play's purchase sheet and
 * reports unconsumed purchases. It never consumes. Consuming happens on the
 * server (play-purchase) AFTER the credit is recorded, so a crash anywhere in
 * between leaves an unconsumed purchase that the next launch re-submits,
 * rather than a consumed one nobody was credited for.
 *
 * A local plugin rather than a package: the plugins that exist were either
 * dead, subscription-shaped, or a third-party service sitting between us and
 * Google (see maintenance_todo.txt, 2026-07-31 research).
 */
@CapacitorPlugin(name = "PlayBilling")
public class PlayBillingPlugin extends Plugin implements PurchasesUpdatedListener {

    private BillingClient client;
    private final Map<String, ProductDetails> productDetails = new HashMap<>();
    /** The purchase() call waiting on Play's sheet; at most one at a time. */
    private PluginCall purchaseCall;

    @Override
    public void load() {
        client = BillingClient.newBuilder(getContext())
            .setListener(this)
            .enablePendingPurchases(PendingPurchasesParams.newBuilder().enableOneTimeProducts().build())
            // NOT enableAutoServiceReconnection(). With it, a device with no
            // Play Store fails every call as a generic SERVICE_DISCONNECTED
            // after its retries, hiding the BILLING_UNAVAILABLE that setup
            // actually returned -- so the app told people to "check your
            // connection" on a phone that can never buy. whenReady() connects
            // on demand instead, and reports setup's own answer.
            .build();
    }

    /** Runs {@code then} once connected, or rejects {@code call} if Play is unavailable. */
    private void whenReady(PluginCall call, Runnable then) {
        if (client.isReady()) { then.run(); return; }
        client.startConnection(new BillingClientStateListener() {
            @Override
            public void onBillingSetupFinished(BillingResult result) {
                if (result.getResponseCode() == BillingClient.BillingResponseCode.OK) then.run();
                else reject(call, result);
            }

            @Override
            public void onBillingServiceDisconnected() {
                // Nothing to do: the next call finds !isReady() and reconnects.
            }
        });
    }

    private static String codeName(int code) {
        switch (code) {
            case BillingClient.BillingResponseCode.USER_CANCELED:       return "USER_CANCELED";
            case BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED:  return "ITEM_ALREADY_OWNED";
            case BillingClient.BillingResponseCode.BILLING_UNAVAILABLE: return "BILLING_UNAVAILABLE";
            case BillingClient.BillingResponseCode.SERVICE_UNAVAILABLE: return "SERVICE_UNAVAILABLE";
            case BillingClient.BillingResponseCode.SERVICE_DISCONNECTED: return "SERVICE_DISCONNECTED";
            case BillingClient.BillingResponseCode.ITEM_UNAVAILABLE:    return "ITEM_UNAVAILABLE";
            case BillingClient.BillingResponseCode.NETWORK_ERROR:       return "NETWORK_ERROR";
            case BillingClient.BillingResponseCode.DEVELOPER_ERROR:     return "DEVELOPER_ERROR";
            default:                                                    return "ERROR";
        }
    }

    private static void reject(PluginCall call, BillingResult result) {
        String msg = result.getDebugMessage();
        call.reject(msg == null || msg.isEmpty() ? codeName(result.getResponseCode()) : msg,
            codeName(result.getResponseCode()));
    }

    private static JSObject toJS(Purchase p) {
        JSObject o = new JSObject();
        List<String> products = p.getProducts();
        o.put("productId", products.isEmpty() ? null : products.get(0));
        o.put("purchaseToken", p.getPurchaseToken());
        o.put("orderId", p.getOrderId());
        o.put("state",
            p.getPurchaseState() == Purchase.PurchaseState.PURCHASED ? "purchased"
            : p.getPurchaseState() == Purchase.PurchaseState.PENDING ? "pending"
            : "unspecified");
        AccountIdentifiers ids = p.getAccountIdentifiers();
        o.put("accountId", ids == null ? null : ids.getObfuscatedAccountId());
        return o;
    }

    private static JSArray toJS(List<Purchase> purchases) {
        JSArray arr = new JSArray();
        if (purchases != null) for (Purchase p : purchases) arr.put(toJS(p));
        return arr;
    }

    @PluginMethod
    public void getProducts(PluginCall call) {
        List<String> ids;
        try {
            ids = call.getArray("productIds", new JSArray()).toList();
        } catch (JSONException e) {
            call.reject("productIds must be an array of strings");
            return;
        }
        if (ids.isEmpty()) {
            JSObject empty = new JSObject();
            empty.put("products", new JSArray());
            call.resolve(empty);
            return;
        }

        List<QueryProductDetailsParams.Product> query = new ArrayList<>();
        for (String id : ids) {
            query.add(QueryProductDetailsParams.Product.newBuilder()
                .setProductId(id)
                .setProductType(BillingClient.ProductType.INAPP)
                .build());
        }
        QueryProductDetailsParams params = QueryProductDetailsParams.newBuilder().setProductList(query).build();

        whenReady(call, () -> client.queryProductDetailsAsync(params, (result, details) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { reject(call, result); return; }
            JSArray out = new JSArray();
            for (ProductDetails pd : details.getProductDetailsList()) {
                ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
                if (offer == null) continue;
                productDetails.put(pd.getProductId(), pd);
                JSObject o = new JSObject();
                o.put("productId", pd.getProductId());
                o.put("title", pd.getName());
                o.put("price", offer.getFormattedPrice());
                o.put("priceMicros", offer.getPriceAmountMicros());
                o.put("currency", offer.getPriceCurrencyCode());
                out.put(o);
            }
            JSObject ret = new JSObject();
            ret.put("products", out);
            call.resolve(ret);
        }));
    }

    @PluginMethod
    public void purchase(PluginCall call) {
        String productId = call.getString("productId");
        String accountId = call.getString("accountId");
        ProductDetails pd = productDetails.get(productId);
        if (pd == null) { call.reject("Call getProducts first", "ITEM_UNAVAILABLE"); return; }
        if (accountId == null || accountId.isEmpty()) { call.reject("accountId is required", "DEVELOPER_ERROR"); return; }
        if (purchaseCall != null) { call.reject("A purchase is already in progress", "ERROR"); return; }

        BillingFlowParams.ProductDetailsParams.Builder item =
            BillingFlowParams.ProductDetailsParams.newBuilder().setProductDetails(pd);
        ProductDetails.OneTimePurchaseOfferDetails offer = pd.getOneTimePurchaseOfferDetails();
        if (offer != null && offer.getOfferToken() != null) item.setOfferToken(offer.getOfferToken());

        BillingFlowParams params = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(Collections.singletonList(item.build()))
            // Carried through to the server's verification response as
            // obfuscatedExternalAccountId, which is how play-purchase knows
            // whose purchase it is being asked to credit.
            .setObfuscatedAccountId(accountId)
            .build();

        whenReady(call, () -> {
            purchaseCall = call;
            BillingResult launched = client.launchBillingFlow(getActivity(), params);
            if (launched.getResponseCode() != BillingClient.BillingResponseCode.OK) {
                purchaseCall = null;
                reject(call, launched);
            }
        });
    }

    /** Every purchase Play still holds unconsumed — what the app re-submits on launch. */
    @PluginMethod
    public void getUnconsumedPurchases(PluginCall call) {
        QueryPurchasesParams params = QueryPurchasesParams.newBuilder()
            .setProductType(BillingClient.ProductType.INAPP)
            .build();
        whenReady(call, () -> client.queryPurchasesAsync(params, (result, purchases) -> {
            if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { reject(call, result); return; }
            JSObject ret = new JSObject();
            ret.put("purchases", toJS(purchases));
            call.resolve(ret);
        }));
    }

    @Override
    public void onPurchasesUpdated(BillingResult result, List<Purchase> purchases) {
        PluginCall call = purchaseCall;
        purchaseCall = null;

        if (call == null) {
            // Not from a purchase() we launched: a pending payment completing
            // while the app is open. Hand it to JS to claim.
            if (result.getResponseCode() == BillingClient.BillingResponseCode.OK && purchases != null) {
                JSObject ev = new JSObject();
                ev.put("purchases", toJS(purchases));
                notifyListeners("purchasesUpdated", ev);
            }
            return;
        }

        if (result.getResponseCode() != BillingClient.BillingResponseCode.OK) { reject(call, result); return; }
        if (purchases == null || purchases.isEmpty()) { call.reject("Play returned no purchase", "ERROR"); return; }
        call.resolve(toJS(purchases.get(0)));
    }
}
