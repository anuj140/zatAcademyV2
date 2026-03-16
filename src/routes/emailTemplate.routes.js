const express = require('express');
const router = express.Router();
const {
  getAllTemplates,
  getTemplate,
  createTemplate,
  updateTemplate,
  deleteTemplate,
  previewTemplate,
  listDefaults,
} = require('../controllers/emailTemplate.controller');
const { protect } = require('../middleware/auth');
const { authorize } = require('../middleware/role');

router.use(protect, authorize('admin', 'superAdmin'));

// List available default slugs (before /:slug to avoid conflict)
router.get('/defaults', listDefaults);

// CRUD routes
router.get('/', getAllTemplates);
router.post('/', createTemplate);
router.get('/:slug', getTemplate);
router.put('/:slug', updateTemplate);
router.delete('/:slug', deleteTemplate);

// Preview a rendered template with test variables
router.post('/:slug/preview', previewTemplate);

module.exports = router;
