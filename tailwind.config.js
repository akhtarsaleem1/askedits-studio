export default {
  content: ["./index.html", "./src/frontend/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Montserrat", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
      boxShadow: {
        focus: "0 0 0 1px rgba(148, 163, 184, 0.18), 0 10px 30px rgba(15, 23, 42, 0.38)"
      }
    }
  },
  plugins: []
}

