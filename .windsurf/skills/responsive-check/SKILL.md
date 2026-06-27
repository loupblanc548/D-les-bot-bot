# Skill: responsive-check

## Nom
Responsive Check — Tester l'affichage multi-écrans

## Description
Test de l'affichage responsive du desktop-app Electron et du dashboard backend sur différentes tailles d'écran et navigateurs.

## Quand l'utiliser
- Après des modifications UI dans le desktop-app
- Après des modifications du dashboard backend
- Vérification de la compatibilité mobile/tablette/desktop
- Test sur différents navigateurs

## Déclencheurs
- "responsive check"
- "test responsive"
- "mobile"
- "tablette"
- "multi-écran"
- "cross-browser"

## Prérequis
- Desktop-app Electron opérationnel
- Dashboard backend accessible
- Navigateurs installés (Chrome, Firefox, Edge)

## Étapes détaillées

### 1. Mobile (360px - 480px)
- Redimensionner la fenêtre Electron à 360px de large
- Vérifier le dashboard backend à 360px (Chrome DevTools)
- Vérifier que tous les éléments sont visibles et utilisables
- Vérifier le texte (pas de débordement)
- Vérifier les boutons (taille minimum 44x44px pour le touch)

### 2. Tablette (768px - 1024px)
- Redimensionner à 768px
- Vérifier la disposition (colonnes vs lignes)
- Vérifier les transitions entre mobile et desktop

### 3. Desktop (1200px+)
- Vérifier l'affichage par défaut
- Vérifier les grandes résolutions (1920px, 2560px)
- Vérifier que le contenu ne s'étire pas trop (max-width)

### 4. Navigateurs
- **Chrome/Chromium** : référence (Electron utilise Chromium)
- **Firefox** : tester le dashboard backend
- **Edge** : tester le dashboard backend
- Vérifier les préfixes CSS si nécessaires

### 5. Embeds Discord
- Vérifier l'affichage des embeds sur Discord mobile
- Vérifier l'affichage des embeds sur Discord desktop
- Les embeds Discord sont nativement responsive — vérifier surtout le contenu

## Commandes exécutables
```bash
cd desktop-app && npm start    # Lancer le desktop-app
# Utiliser Chrome DevTools (F12) pour le responsive du dashboard
```

## Vérifications finales
- [ ] L'affichage est correct sur mobile (360px)
- [ ] L'affichage est correct sur tablette (768px)
- [ ] L'affichage est correct sur desktop (1200px+)
- [ ] Les embeds Discord s'affichent correctement sur mobile et desktop
- [ ] Aucun débordement de texte
- [ ] Les boutons sont utilisables au touch (44x44px min)

## Gestion des erreurs
- Si le texte déborde : utiliser `word-wrap: break-word` ou `overflow: hidden`
- Si les éléments se chevauchent : vérifier les flexbox/grid
- Si les boutons sont trop petits : augmenter le padding

## Bonnes pratiques
- Utiliser Chrome DevTools pour simuler les différentes tailles
- Tester sur de vrais appareils quand possible
- Utiliser des media queries dans le CSS du desktop-app
- Les embeds Discord sont gérés par Discord — se concentrer sur le contenu
