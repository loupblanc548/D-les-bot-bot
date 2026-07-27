/**
 * ESLint rule: no-silent-catch
 *
 * Interdit le pattern .catch(() => {}) qui avale les erreurs silencieusement.
 * Force au minimum un logger.debug() ou un commentaire explicite // @silent-catch
 * quand l'ignorance est un choix délibéré.
 */

module.exports = {
  meta: {
    type: "suggestion",
    docs: {
      description: "Interdit .catch(() => {}) — les erreurs doivent être loggées",
      category: "Best Practices",
      recommended: true,
    },
    schema: [],
    messages: {
      silentCatch:
        "Ne pas utiliser .catch(() => {}). Utilisez .catch((err) => logger.debug(err)) ou ajoutez un commentaire // @silent-catch si l'ignorance est délibérée.",
    },
  },
  create(context) {
    return {
      CallExpression(node) {
        if (
          node.callee.type === "MemberExpression" &&
          node.callee.property.type === "Identifier" &&
          node.callee.property.name === "catch" &&
          node.arguments.length === 1 &&
          node.arguments[0].type === "ArrowFunctionExpression" &&
          node.arguments[0].params.length === 0 &&
          node.arguments[0].body.type === "BlockStatement" &&
          node.arguments[0].body.body.length === 0
        ) {
          // Check if there's a @silent-catch comment on the line above
          const sourceCode = context.getSourceCode();
          const comments = sourceCode.getCommentsBefore(node);
          const hasExplicitComment = comments.some(
            (c) => c.value.includes("@silent-catch") || c.value.includes("intentional"),
          );
          if (!hasExplicitComment) {
            context.report({
              node: node.arguments[0],
              messageId: "silentCatch",
            });
          }
        }
      },
    };
  },
};
