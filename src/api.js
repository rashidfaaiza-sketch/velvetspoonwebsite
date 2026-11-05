export async function api(url, options = {}) {
  const headers = { ...options.headers };
  if (options.body && !(options.body instanceof FormData))
    headers["Content-Type"] = "application/json";
  const response = await fetch("/api" + url, {
    ...options,
    headers,
    body:
      options.body instanceof FormData
        ? options.body
        : options.body
          ? JSON.stringify(options.body)
          : undefined,
  });
  let data;
  try {
    data = await response.json();
  } catch {
    throw Error("The server did not return a valid response.");
  }
  if (!response.ok)
    throw Error(data.error || "Something went wrong. Please try again.");
  return data;
}
export const money = (n) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: n % 100 ? 2 : 0,
  }).format(n / 100);
// Crop the approved review sheets in the browser, retaining their exact imagery.
export const productPhotos = {
  milk: {
    src: "/images/tres-leches-biscoff-concepts.png",
    crop: "26 12 850 710",
  },
  biscoff: {
    src: "/images/tres-leches-biscoff-concepts.png",
    crop: "897 12 849 710",
  },
  coconut: { src: "/images/coconut-rose-concepts.png", crop: "15 15 865 857" },
  rose: { src: "/images/coconut-rose-concepts.png", crop: "894 15 866 857" },
};
export function imageSrc(image) {
  return (
    productPhotos[image]?.src ||
    (image === "chocolate"
      ? "/images/choco-crush.png"
      : image === "brownie"
        ? "/images/hero.png"
        : image?.startsWith("/")
          ? image
          : `/images/${image || "milk"}.svg`)
  );
}
export function imageDescription(image, name) {
  const descriptions = {
    milk: "Tres leches cake with cream, rose petals and pistachios",
    biscoff: "Biscoff pudding layered in a glass jar with biscuit crumbs",
    coconut: "Coconut pudding topped with sliced almonds",
    rose: "Rose milk pudding topped with sliced pistachios",
    chocolate: "Chocolate pudding topped with chocolate shavings",
    brownie: "Chocolate brownie with a caramel topping",
  };
  return descriptions[image] || name;
}
export async function launchPayment(order, token, onUpdate, onMessage) {
  const data = await api(`/orders/${order.id}/payment`, {
    method: "POST",
    headers: { "x-order-token": token },
  });
  if (data.demo) {
    onMessage(
      "Demo checkout complete. No payment has been taken and this is not a confirmed bakery order.",
    );
    return;
  }
  if (!window.Razorpay)
    await new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.onload = resolve;
      script.onerror = () =>
        reject(
          Error(
            "Razorpay could not load. Your payment has not been confirmed.",
          ),
        );
      document.body.appendChild(script);
    });
  const checkout = new window.Razorpay({
    key: data.key,
    order_id: data.providerOrderId,
    amount: data.amount,
    currency: data.currency,
    name: "Velvet Spoon",
    description:
      data.mode === "test"
        ? "TEST PAYMENT — no live charge"
        : "Made to order, with love",
    prefill: {
      name: data.customer.name,
      contact: "+91" + data.customer.phone,
      email: data.customer.email || undefined,
    },
    theme: { color: "#56362c" },
    handler: async (result) => {
      try {
        onMessage("Verifying your payment securely…");
        const verified = await api(`/orders/${order.id}/verify`, {
          method: "POST",
          headers: { "x-order-token": token },
          body: result,
        });
        if (verified.pending) onMessage(verified.message);
        else {
          onUpdate(verified.order);
          onMessage("Payment verified by the server.");
        }
      } catch (e) {
        onMessage(
          e.message + " Refresh the order status before retrying payment.",
        );
      }
    },
    modal: {
      ondismiss: async () => {
        try {
          await api(`/orders/${order.id}/payment-dismissed`, {
            method: "POST",
            headers: { "x-order-token": token },
          });
        } catch {}
        onMessage(
          "Checkout closed. Payment is not confirmed. Refresh the order status before retrying.",
        );
      },
    },
  });
  checkout.on("payment.failed", () =>
    onMessage(
      "Payment failed. No payment is confirmed. Check the order status before trying again.",
    ),
  );
  checkout.open();
}
