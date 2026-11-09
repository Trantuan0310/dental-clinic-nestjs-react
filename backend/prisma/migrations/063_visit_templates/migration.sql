CREATE TABLE visit_templates (
 id uuid PRIMARY KEY DEFAULT uuid_generate_v7(),
 name varchar(200) NOT NULL,
 service_id uuid NOT NULL REFERENCES services(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 soap jsonb NOT NULL,
 treatments jsonb NOT NULL,
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz
);
CREATE INDEX visit_templates_service_id_idx ON visit_templates(service_id);
CREATE TABLE visit_template_applications (
 encounter_id uuid NOT NULL REFERENCES encounters(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 template_id uuid NOT NULL REFERENCES visit_templates(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 applied_by uuid NOT NULL REFERENCES users(id) ON DELETE RESTRICT ON UPDATE CASCADE,
 applied_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (encounter_id, template_id)
);
