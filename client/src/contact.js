const form = document.querySelector("#contact-form");
if (form) {
  const status = document.querySelector("#form-status");
  const fields = [
    { input: form.elements.name, error: document.querySelector("#name-error"), label: "Full name" },
    { input: form.elements.email, error: document.querySelector("#email-error"), label: "Email address" },
    { input: form.elements.subject, error: document.querySelector("#subject-error"), label: "Subject" },
    { input: form.elements.message, error: document.querySelector("#message-error"), label: "Message" },
  ];

  function validate(field) {
    const value = field.input.value.trim();
    let message = "";
    if (!value) message = `${field.label} is required.`;
    else if (field.input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = "Enter a valid email address.";
    field.error.textContent = message;
    field.input.setAttribute("aria-invalid", String(Boolean(message)));
    return !message;
  }

  fields.forEach(({ input, error }) => {
    input.addEventListener("input", () => {
      if (error.textContent) {
        const field = fields.find((candidate) => candidate.input === input);
        validate(field);
      }
    });
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    status.textContent = "";
    const invalidFields = fields.filter((field) => !validate(field));
    if (invalidFields.length) {
      status.textContent = "Please correct the highlighted fields.";
      invalidFields[0].input.focus();
      return;
    }

    const formData = new FormData(form);
    const name = String(formData.get("name") || "").trim();
    const email = String(formData.get("email") || "").trim();
    const subject = String(formData.get("subject") || "").trim();
    const message = String(formData.get("message") || "").trim();

    status.textContent = "Sending inquiry...";
    status.style.color = "var(--color-primary, #0369a1)";

    try {
      const response = await fetch("/api/contact-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name, email, subject, message }),
      });

      if (response.ok) {
        status.textContent = "Thank you! Your inquiry has been sent to DASPAR Sounds & Entertainment. We will get back to you shortly.";
        status.style.color = "#15803d";
        form.reset();
        return;
      }
    } catch {
      // Backend not running or static host; proceed to mailto fallback
    }

    // Fallback: open mail application
    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      "",
      message,
    ].join("\n");
    const draftUrl = `mailto:dasparent@outlook.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = "Opening an email draft in your mail application. Review and send it there.";
    status.style.color = "inherit";
    window.location.href = draftUrl;
  });
}

