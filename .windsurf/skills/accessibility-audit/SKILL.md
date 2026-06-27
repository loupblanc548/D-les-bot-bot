# Skill: accessibility-audit

## Nom
Accessibility Audit — WCAG, navigation clavier, contraste, lecteurs d'écran

## Description
Audit d'accessibilité du desktop-app Electron et du dashboard backend : conformité WCAG, navigation clavier, contraste des couleurs, compatibilité lecteurs d'écran.

## Quand l'utiliser
- Audit d'accessibilité du desktop-app
- Audit du dashboard backend
- Après des modifications UI significatives
- Mise en conformité WCAG

## Déclencheurs
- "accessibility audit"
- "audit accessibilité"
- "WCAG"
- "navigation clavier"
- "contraste"
- "lecteur d'écran"
- "a11y"

## Prérequis
- Desktop-app Electron opérationnel
- Dashboard backend accessible
- Comprendre les principes WCAG 2.2

## Étapes détaillées

### 1. WCAG
- Vérifier la conformité aux principes WCAG 2.2 (A, AA)
- **Perceptible** : contraste, alternatives textuelles
- **Utilisable** : navigation clavier, temps suffisant, pas de contenu clignotant
- **Compréhensible** : langage clair, prévisibilité, assistance
- **Robuste** : compatibilité avec les technologies d'assistance

### 2. Navigation clavier
- Vérifier que tous les éléments interactifs sont accessibles au clavier
- Vérifier l'ordre de tabulation (tabindex logique)
- Vérifier les focus visibles (outline visible sur focus)
- Vérifier les raccourcis clavier
- Tester avec Tab, Shift+Tab, Enter, Space, Escape

### 3. Contraste
- Vérifier le contraste texte/fond (minimum 4.5:1 pour texte normal, 3:1 pour texte large)
- Utiliser un outil de vérification (Chrome DevTools > Accessibility)
- Vérifier les couleurs des boutons et liens
- Vérifier les états (hover, focus, active, disabled)

### 4. Lecteurs d'écran
- Vérifier les `alt` sur les images
- Vérifier les `aria-label` sur les éléments interactifs sans texte visible
- Vérifier les `aria-live` pour les contenus dynamiques
- Vérifier la structure HTML sémantique (nav, main, section, article)
- Tester avec NVDA (Windows) ou VoiceOver (macOS)

### 5. Desktop-app Electron
- L'accessibilité Electron est basée sur Chromium
- Utiliser les DevTools > Accessibility panel
- Vérifier l'arbre d'accessibilité

## Commandes exécutables
```bash
cd desktop-app && npm start    # Lancer le desktop-app pour l'audit
# Chrome DevTools > F12 > Accessibility panel
# Lighthouse audit (si dashboard web)
```

## Vérifications finales
- [ ] Tous les éléments interactifs sont accessibles au clavier
- [ ] Le contraste texte/fond respecte les minimums WCAG (4.5:1)
- [ ] Les images ont des `alt` descriptifs
- [ ] Les éléments interactifs ont des `aria-label` si nécessaire
- [ ] La structure HTML est sémantique
- [ ] L'ordre de tabulation est logique
- [ ] Les focus visibles sont présents

## Gestion des erreurs
- Si le contraste est insuffisant : ajuster les couleurs CSS
- Si un élément n'est pas au clavier : ajouter `tabindex` et gestionnaire clavier
- Si un `alt` manque : l'ajouter avec une description pertinente

## Bonnes pratiques
- Utiliser Chrome DevTools Accessibility panel pour l'audit
- Prioriser le niveau AA (référence WCAG)
- Ne pas supprimer les outlines de focus (ou les remplacer par un style visible)
- Utiliser des balises HTML sémantiques plutôt que des divs
- Tester avec un vrai lecteur d'écran pour les cas critiques
