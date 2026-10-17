const form = document.querySelector("#contact-form");
if (form) {
  const status = document.querySelector("#form-status");
  const fields = [
    { input: form.elements.name, error: document.querySelector("#name-error"), label: "Full name" },
    { input: form.elements.email, error: document.querySelector("#email-error"), label: "Email address" },
    { input: form.elements.subject, error: document.querySelector("#subject-error"), label: "Subject" },
    { input: form.elements.message, error: document.querySelector("#message-error"), label: "Message" },
  ];
  const submitButton = form.querySelector('button[type="submit"]');

  function validate(field) {
    const value = field.input.value.trim();
    let message = "";
    if (!value) message = `${field.label} is required.`;
    else if (field.input.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) message = "Enter a valid email address.";
    field.error.textContent = message;
    field.input.setAttribute("aria-invalid", String(Boolean(message)));
    return !message;
  }

  function openEmailDraft({ name, email, subject, message }) {
    const body = [`Name: ${name}`, `Email: ${email}`, "", message].join("\n");
    const draftUrl = `mailto:dasparent@outlook.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = "No inquiry was saved to the website. Opening an email draft for you to review and send.";
    status.style.color = "inherit";
    window.location.href = draftUrl;
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
    const inquiry = {
      name: String(formData.get("name") || "").trim(),
      email: String(formData.get("email") || "").trim(),
      subject: String(formData.get("subject") || "").trim(),
      message: String(formData.get("message") || "").trim(),
    };

    status.textContent = "Submitting your inquiry...";
    status.style.color = "var(--color-primary, #0369a1)";
    if (submitButton) submitButton.disabled = true;

    let response;
    try {
      response = await fetch("/api/contact-inquiries", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(inquiry),
        cache: "no-store",
      });
    } catch {
      openEmailDraft(inquiry);
      if (submitButton) submitButton.disabled = false;
      return;
    }

    const isJson = /application\/json/i.test(response.headers.get("content-type") || "");
    if (!isJson) {
      openEmailDraft(inquiry);
      if (submitButton) submitButton.disabled = false;
      return;
    }

    const result = await response.json().catch(() => ({}));
    if (!response.ok) {
      status.textContent = result.error || "The server did not confirm that your inquiry was saved. No email draft was opened.";
      status.style.color = "#dc2626";
      if (submitButton) submitButton.disabled = false;
      return;
    }

    status.textContent = result.message || "Your inquiry was saved. The website did not provide an email-delivery result.";
    status.style.color = "#15803d";
    form.reset();
    if (submitButton) submitButton.disabled = false;
  });
}
