let apiUrl;

fetch("/config.json")
  .then((response) => response.json())
  .then((data) => {
    apiUrl = data.apiUrl;
  })
  .catch((error) => {
    console.error("Error fetching config:", error);
  });

document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("tradeForm");
  const conditionSelect = document.getElementById("condition");
  const boundFields = document.getElementById("boundFields");
  const priceField = document.getElementById("priceField");
  const deleteBtn = document.getElementById("deleteBtn");
  const modal = document.getElementById("modal");
  const modalTitle = document.getElementById("modal-title");
  const modalMessage = document.getElementById("modal-message");
  const modalConfirm = document.getElementById("modal-confirm");
  const modalCancel = document.getElementById("modal-cancel");
  const loadingOverlay = document.getElementById("loadingOverlay");

  // Loading state management
  function showLoading() {
    loadingOverlay.style.display = "flex";
    document.body.style.overflow = "hidden";
    form.classList.add("form-loading");
    setTimeout(() => loadingOverlay.classList.add("show"), 10);
  }

  function hideLoading() {
    loadingOverlay.classList.remove("show");
    setTimeout(() => {
      loadingOverlay.style.display = "none";
      document.body.style.overflow = "";
      form.classList.remove("form-loading");
    }, 300);
  }

  // Custom alert/confirm functions
  function showModal(title, message, isConfirm = false) {
    return new Promise((resolve) => {
      modalTitle.textContent = title;
      modalMessage.textContent = message;
      modalCancel.style.display = isConfirm ? "block" : "none";

      modal.style.display = "flex";
      setTimeout(() => {
        modal.classList.add("show");
        modalConfirm.focus(); // Focus the primary button
      }, 10);

      function closeModal(result) {
        modal.classList.remove("show");
        setTimeout(() => {
          modal.style.display = "none";
          resolve(result);
        }, 200);
      }

      // Handle button clicks
      modalConfirm.onclick = () => closeModal(true);
      modalCancel.onclick = () => closeModal(false);

      // Handle keyboard events
      const handleKeydown = (e) => {
        if (e.key === "Escape") {
          e.preventDefault();
          closeModal(false);
        } else if (
          e.key === "Enter" &&
          document.activeElement === modalConfirm
        ) {
          e.preventDefault();
          closeModal(true);
        } else if (e.key === "Tab") {
          // Trap focus inside modal
          const focusableElements = modal.querySelectorAll("button");
          const firstElement = focusableElements[0];
          const lastElement = focusableElements[focusableElements.length - 1];

          if (e.shiftKey && document.activeElement === firstElement) {
            e.preventDefault();
            lastElement.focus();
          } else if (!e.shiftKey && document.activeElement === lastElement) {
            e.preventDefault();
            firstElement.focus();
          }
        }
      };

      modal.addEventListener("keydown", handleKeydown);
      // Clean up event listener when modal closes
      const cleanup = () => modal.removeEventListener("keydown", handleKeydown);
      modalConfirm.addEventListener("click", cleanup);
      modalCancel.addEventListener("click", cleanup);
    });
  }

  function showAlert(message, title = "Notice") {
    return showModal(title, message, false);
  }

  function showConfirm(message, title = "Confirm") {
    return showModal(title, message, true);
  }

  // Function to reset form state
  function resetFormState() {
    boundFields.style.display = "none";
    priceField.style.display = "block";
    document.getElementById("price").required = true;
    document.getElementById("upperBound").required = false;
    document.getElementById("lowerBound").required = false;
    clearErrors();
  }

  // Set initial state
  resetFormState();

  // Add reset handler to form
  form.addEventListener("reset", () => {
    // Use setTimeout to let the form reset complete first
    setTimeout(resetFormState, 0);
  });

  // Dynamic field toggling based on condition
  conditionSelect.addEventListener("change", () => {
    const value = conditionSelect.value;
    if (value === "entCh" || value === "exCh") {
      boundFields.style.display = "flex";
      priceField.style.display = "none";
      document.getElementById("upperBound").required = true;
      document.getElementById("lowerBound").required = true;
      document.getElementById("price").required = false;
    } else {
      boundFields.style.display = "none";
      priceField.style.display = "block";
      document.getElementById("upperBound").required = false;
      document.getElementById("lowerBound").required = false;
      document.getElementById("price").required = true;
    }
  });

  // Delete button handler
  deleteBtn.addEventListener("click", async () => {
    const userID = document.getElementById("userID").value;
    if (!userID) {
      showError("userID", "User ID is required for deletion");
      return;
    }

    const confirmed = await showConfirm(
      "Are you sure you want to delete this trade?",
      "Delete Trade"
    );

    const deleteUrl = `${apiUrl}/delete/${userID}/USER${userID}`;
    // console.log("Delete URL:", deleteUrl);

    if (confirmed) {
      showLoading();
      try {
        const response = await fetch(deleteUrl, {
          method: "DELETE",
        });

        const res = await response.json();
        if (!response.ok) {
          // throw the specific error message from the response
          throw new Error("Delete Operation failed!" + (res.message || ""));
        }

        hideLoading();
        await showAlert(res.message, "Success");
        form.reset();
      } catch (error) {
        hideLoading();
        await showAlert(error.message, "Error");
      }
    }
  });

  // Form submission handler
  form.addEventListener("submit", async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    const formData = {
      userID: document.getElementById("userID").value,
      email: document.getElementById("email").value,
      symbol: document.getElementById("symbol").value,
      condition: conditionSelect.value,
    };

    if (conditionSelect.value === "entCh" || conditionSelect.value === "exCh") {
      formData.upperBound = parseFloat(
        document.getElementById("upperBound").value
      );
      formData.lowerBound = parseFloat(
        document.getElementById("lowerBound").value
      );
    } else {
      formData.upperBound = parseFloat(document.getElementById("price").value);
      formData.lowerBound = 0.0; // Default lower bound for price conditions
    }

    showLoading();
    try {
      const response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(formData),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(`Submission failed. Message: ${data.message || ""}`);
      }

      hideLoading();
      await showAlert(
        `Alert submitted successfully for ${formData.userID}. ${
          data.message || ""
        }`,
        "Success"
      );
      form.reset();
    } catch (error) {
      hideLoading();
      await showAlert("Error submitting trade: " + error.message, "Error");
    }
  });

  // Form validation
  function validateForm() {
    let isValid = true;

    // Clear previous errors
    clearErrors();

    // Validate User ID
    const userID = document.getElementById("userID").value;
    if (!userID || userID.trim() === "") {
      showError("userID", "User ID is required");
      isValid = false;
    }

    // Validate Email
    const email = document.getElementById("email").value;
    if (!email) {
      showError("email", "Email is required");
      isValid = false;
    } else if (!isValidEmail(email)) {
      showError("email", "Please enter a valid email address");
      isValid = false;
    }

    // Validate Symbol
    const symbol = document.getElementById("symbol").value;
    if (!symbol) {
      showError("symbol", "Please select a symbol");
      isValid = false;
    }

    // Validate Condition
    const condition = conditionSelect.value;
    if (!condition) {
      showError("condition", "Please select a condition");
      isValid = false;
    }

    // Validate bounds or price based on condition
    if (condition === "entCh" || condition === "exCh") {
      const upperBoundInput = document.getElementById("upperBound");
      const lowerBoundInput = document.getElementById("lowerBound");

      if (!upperBoundInput.value.trim()) {
        showError("upperBound", "Upper bound price is required");
        isValid = false;
      } else {
        const upperBound = parseFloat(upperBoundInput.value);
        if (isNaN(upperBound)) {
          showError("upperBound", "Please enter a valid number");
          isValid = false;
        } else if (upperBound <= 0) {
          showError("upperBound", "Upper bound must be a positive number");
          isValid = false;
        }
      }

      if (!lowerBoundInput.value.trim()) {
        showError("lowerBound", "Lower bound price is required");
        isValid = false;
      } else {
        const lowerBound = parseFloat(lowerBoundInput.value);
        if (isNaN(lowerBound)) {
          showError("lowerBound", "Please enter a valid number");
          isValid = false;
        } else if (lowerBound <= 0) {
          showError("lowerBound", "Lower bound must be a positive number");
          isValid = false;
        }

        // Only check bound relationship if both values are valid numbers
        const upperBound = parseFloat(upperBoundInput.value);
        if (
          !isNaN(upperBound) &&
          !isNaN(lowerBound) &&
          upperBound <= lowerBound
        ) {
          showError(
            "upperBound",
            "Upper bound must be greater than lower bound"
          );
          isValid = false;
        }
      }
    } else {
      const priceInput = document.getElementById("price");

      if (!priceInput.value.trim()) {
        showError("price", "Price is required");
        isValid = false;
      } else {
        const price = parseFloat(priceInput.value);
        if (isNaN(price)) {
          showError("price", "Please enter a valid number");
          isValid = false;
        } else if (price <= 0) {
          showError("price", "Price must be a positive number");
          isValid = false;
        }
      }
    }

    return isValid;
  }

  // Helper functions
  function showError(fieldId, message) {
    const errorElement = document.getElementById(fieldId + "Error");
    if (errorElement) {
      errorElement.textContent = message;
    }
  }

  function clearErrors() {
    const errorElements = document.querySelectorAll(".error");
    errorElements.forEach((element) => {
      element.textContent = "";
    });
  }

  function isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }
});
