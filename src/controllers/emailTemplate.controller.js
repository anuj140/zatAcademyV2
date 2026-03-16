const EmailTemplate = require('../models/EmailTemplate');
const { DEFAULTS } = require('../utils/templateService');

// @desc    Get all email templates
// @route   GET /api/v1/email-templates
// @access  Private/Admin/SuperAdmin
exports.getAllTemplates = async (req, res) => {
  try {
    const { category, isActive } = req.query;
    const filter = {};

    if (category) filter.category = category;
    if (isActive !== undefined) filter.isActive = isActive === 'true';

    const templates = await EmailTemplate.find(filter)
      .select('-htmlBody')           // exclude body in list view for brevity
      .sort('category slug')
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    res.status(200).json({
      success: true,
      count: templates.length,
      data: templates,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single email template by slug
// @route   GET /api/v1/email-templates/:slug
// @access  Private/Admin/SuperAdmin
exports.getTemplate = async (req, res) => {
  try {
    const template = await EmailTemplate.findOne({ slug: req.params.slug })
      .populate('createdBy', 'name email')
      .populate('updatedBy', 'name email');

    if (!template) {
      // Show default if it exists
      const defaultTpl = DEFAULTS[req.params.slug];
      if (defaultTpl) {
        return res.status(200).json({
          success: true,
          source: 'default',
          data: {
            slug: req.params.slug,
            subject: defaultTpl.subject,
            htmlBody: defaultTpl.htmlBody,
            isActive: true,
          },
        });
      }
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.status(200).json({ success: true, source: 'database', data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create a new email template
// @route   POST /api/v1/email-templates
// @access  Private/Admin/SuperAdmin
exports.createTemplate = async (req, res) => {
  try {
    const { slug, name, subject, htmlBody, variables, category, isActive } = req.body;

    // Prevent overwriting system defaults silently — allow it but warn
    const existingDefault = DEFAULTS[slug];

    const template = await EmailTemplate.create({
      slug,
      name,
      subject,
      htmlBody,
      variables: variables || [],
      category,
      isActive: isActive !== undefined ? isActive : true,
      createdBy: req.user.id,
    });

    res.status(201).json({
      success: true,
      message: existingDefault
        ? 'Template created. This slug overrides a system default.'
        : 'Template created successfully.',
      data: template,
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({
        success: false,
        message: `A template with slug "${req.body.slug}" already exists`,
      });
    }
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update an email template by slug
// @route   PUT /api/v1/email-templates/:slug
// @access  Private/Admin/SuperAdmin
exports.updateTemplate = async (req, res) => {
  try {
    const allowedFields = ['name', 'subject', 'htmlBody', 'variables', 'category', 'isActive'];
    const updates = {};
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) updates[field] = req.body[field];
    });
    updates.updatedBy = req.user.id;

    const template = await EmailTemplate.findOneAndUpdate(
      { slug: req.params.slug },
      updates,
      { new: true, runValidators: true }
    );

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    res.status(200).json({ success: true, message: 'Template updated successfully', data: template });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete a template by slug
// @route   DELETE /api/v1/email-templates/:slug
// @access  Private/Admin/SuperAdmin
exports.deleteTemplate = async (req, res) => {
  try {
    const template = await EmailTemplate.findOneAndDelete({ slug: req.params.slug });

    if (!template) {
      return res.status(404).json({ success: false, message: 'Template not found' });
    }

    const hasDefault = !!DEFAULTS[req.params.slug];
    res.status(200).json({
      success: true,
      message: hasDefault
        ? 'Template deleted. System will now use the built-in default for this email.'
        : 'Template deleted successfully.',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Preview a rendered template with sample variables
// @route   POST /api/v1/email-templates/:slug/preview
// @access  Private/Admin/SuperAdmin
exports.previewTemplate = async (req, res) => {
  try {
    const { variables = {} } = req.body;
    const { interpolate } = require('../utils/templateService');

    // Fetch from DB first, then fall back to default
    let tpl = await EmailTemplate.findOne({ slug: req.params.slug });
    if (!tpl) {
      const defaultTpl = DEFAULTS[req.params.slug];
      if (!defaultTpl) {
        return res.status(404).json({ success: false, message: 'Template not found' });
      }
      tpl = defaultTpl;
    }

    const subject = interpolate(tpl.subject, variables);
    const html = interpolate(tpl.htmlBody, variables);

    res.status(200).json({
      success: true,
      data: { subject, html },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    List all available default template slugs
// @route   GET /api/v1/email-templates/defaults
// @access  Private/Admin/SuperAdmin
exports.listDefaults = async (req, res) => {
  try {
    const defaults = Object.keys(DEFAULTS).map((slug) => ({
      slug,
      subject: DEFAULTS[slug].subject,
      inDatabase: false, // will be updated below
    }));

    const dbSlugs = await EmailTemplate.distinct('slug');
    const dbSlugSet = new Set(dbSlugs);

    defaults.forEach((d) => {
      d.inDatabase = dbSlugSet.has(d.slug);
    });

    res.status(200).json({ success: true, count: defaults.length, data: defaults });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
