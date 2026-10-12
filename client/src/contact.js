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

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    status.textContent = "";
    const invalidFields = fields.filter((field) => !validate(field));
    if (invalidFields.length) {
      status.textContent = "Please correct the highlighted fields.";
      invalidFields[0].input.focus();
      return;
    }

    const formData = new FormData(form);
    const subject = String(formData.get("subject")).trim();
    const body = [
      `Name: ${String(formData.get("name")).trim()}`,
      `Email: ${String(formData.get("email")).trim()}`,
      "",
      String(formData.get("message")).trim(),
    ].join("\n");
    const draftUrl = `mailto:dasparent@outlook.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    status.textContent = "Opening an email draft in your mail application. Review and send it there.";
    window.location.href = draftUrl;
  });
}
